/**
 * The model planes, both OpenAI-compatible chat endpoints:
 *   primary  — Groq      (openai/gpt-oss-20b for text, qwen/qwen3.8-27b for page images)
 *   fallback — Gemini API (Gemma 4: gemma-4-26b-a4b-it for text, gemma-4-31b-it for page images)
 * One streaming client serves both. It speaks the browser's NDJSON and hands
 * back Anthropic-shaped content blocks, which is the wire shape the browser's
 * tool loop was written against and keeps working unchanged.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { TOOL_DEFINITIONS } from "./_tools.js";

export type Member = "vision" | "text";

export interface Provider {
	id: "groq" | "gemini";
	label: string;
	baseUrl: string;
	key: string | undefined;
	models: Record<Member, string>;
	/** Which lanes may receive image parts on this provider. */
	imagesOn: Member[];
}

export function providers(): { primary: Provider; fallback: Provider } {
	return {
		primary: {
			id: "groq",
			label: "Groq",
			baseUrl: "https://api.groq.com/openai/v1",
			key: process.env.GROQ_API_KEY,
			models: { text: process.env.STRATUM_MODEL_TEXT ?? "openai/gpt-oss-20b", vision: process.env.STRATUM_MODEL_VISION ?? "qwen/qwen3.8-27b" },
			imagesOn: ["vision"],
		},
		fallback: {
			id: "gemini",
			label: "Gemini API",
			baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
			key: process.env.GEMINI_API_KEY,
			models: { text: process.env.STRATUM_FALLBACK_TEXT ?? "gemma-4-26b-a4b-it", vision: process.env.STRATUM_FALLBACK_VISION ?? "gemma-4-31b-it" },
			imagesOn: ["vision", "text"],
		},
	};
}

interface OpenAIMessage {
	role: "system" | "user" | "assistant" | "tool";
	content?: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
	tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
	tool_call_id?: string;
}

/** Anthropic messages → OpenAI messages. Thinking blocks are dropped; images become data URLs, or a note when the lane cannot see. */
function toOpenAI(system: string, messages: Anthropic.MessageParam[], allowImages: boolean): OpenAIMessage[] {
	const out: OpenAIMessage[] = [{ role: "system", content: system }];
	for (const m of messages) {
		if (typeof m.content === "string") {
			out.push({ role: m.role, content: m.content });
			continue;
		}
		if (m.role === "user") {
			const results = m.content.filter((b): b is Anthropic.ToolResultBlockParam => b.type === "tool_result");
			if (results.length > 0) {
				for (const r of results) {
					const text = typeof r.content === "string" ? r.content : (r.content ?? []).map((c) => (c.type === "text" ? c.text : "")).join("\n");
					out.push({ role: "tool", tool_call_id: r.tool_use_id, content: text });
				}
				continue;
			}
			const parts: NonNullable<Exclude<OpenAIMessage["content"], string>> = [];
			let dropped = 0;
			for (const b of m.content) {
				if (b.type === "text") parts.push({ type: "text", text: b.text });
				else if (b.type === "image" && b.source.type === "base64") {
					if (allowImages) parts.push({ type: "image_url", image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } });
					else dropped += 1;
				}
			}
			if (dropped > 0) parts.unshift({ type: "text", text: `[${dropped} attached image${dropped === 1 ? "" : "s"} could not be forwarded to this model, which cannot see. Say so rather than describing it.]` });
			out.push({ role: "user", content: parts });
			continue;
		}
		const text = m.content.filter((b): b is Anthropic.TextBlockParam => b.type === "text").map((b) => b.text).join("\n");
		const calls = m.content
			.filter((b): b is Anthropic.ToolUseBlockParam => b.type === "tool_use")
			.map((b) => ({ id: b.id, type: "function" as const, function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
		const msg: OpenAIMessage = { role: "assistant", content: text || (calls.length ? undefined : "") };
		if (calls.length) msg.tool_calls = calls;
		out.push(msg);
	}
	return out;
}

export interface TurnResult {
	stop_reason: "end_turn" | "tool_use";
	content: Anthropic.ContentBlock[];
	model: string;
	provider: Provider["id"];
}

/**
 * Stream one turn from a provider. `send` receives {type:"text"} / {type:"thinking"}
 * pieces as they arrive; the return value is the final Anthropic-shaped message.
 * Throws before sending anything if the request is refused, so a caller can fall back cleanly.
 */
export async function streamTurn(
	provider: Provider,
	member: Member,
	system: string,
	messages: Anthropic.MessageParam[],
	send: (piece: unknown) => void,
	options: { signal?: AbortSignal; tools?: boolean } = {},
): Promise<TurnResult> {
	if (!provider.key) throw new Error(`${provider.label}: no API key configured`);
	const model = provider.models[member];
	const body = {
		model,
		stream: true,
		temperature: 0.2,
		max_tokens: 4096,
		messages: toOpenAI(system, messages, provider.imagesOn.includes(member)),
		...(options.tools ? { tools: TOOL_DEFINITIONS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } })), tool_choice: "auto" } : {}),
	};
	const request = () =>
		fetch(`${provider.baseUrl}/chat/completions`, {
			method: "POST",
			headers: { "content-type": "application/json", authorization: `Bearer ${provider.key}` },
			body: JSON.stringify(body),
			signal: options.signal,
		});
	let response = await request();
	if (response.status === 429) {
		// Free tiers meter tokens per minute; wait the time named (capped) and try once more.
		const detail = await response.text().catch(() => "");
		const wait = Math.min(20, Number(/try again in ([\d.]+)s/i.exec(detail)?.[1] ?? 8) + 1);
		await new Promise((r) => setTimeout(r, wait * 1000));
		response = await request();
	}
	if (!response.ok || !response.body) {
		const detail = await response.text().catch(() => "");
		throw new Error(`${provider.label} ${response.status}: ${detail.slice(0, 300)}`);
	}

	let text = "";
	const calls = new Map<number, { id: string; name: string; args: string }>();
	let finish = "";
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	// Gemma writes its reasoning inline as <thought>…</thought>. Route that to the
	// thinking stream and keep it out of the answer, across chunk boundaries.
	const OPEN = "<thought>";
	const CLOSE = "</thought>";
	let mode: "text" | "thought" = "text";
	let pending = "";
	const partialTail = (s: string, tag: string) => {
		for (let n = Math.min(tag.length - 1, s.length); n > 0; n -= 1) if (tag.startsWith(s.slice(-n))) return n;
		return 0;
	};
	const emitContent = (delta: string, final = false) => {
		pending += delta;
		while (pending.length > 0) {
			const tag = mode === "text" ? OPEN : CLOSE;
			const idx = pending.indexOf(tag);
			if (idx >= 0) {
				const before = pending.slice(0, idx);
				if (before) {
					if (mode === "text") {
						text += before;
						send({ type: "text", text: before });
					} else send({ type: "thinking", text: before });
				}
				pending = pending.slice(idx + tag.length);
				mode = mode === "text" ? "thought" : "text";
				continue;
			}
			const hold = final ? 0 : partialTail(pending, tag);
			const out = pending.slice(0, pending.length - hold);
			pending = pending.slice(pending.length - hold);
			if (out) {
				if (mode === "text") {
					text += out;
					send({ type: "text", text: out });
				} else send({ type: "thinking", text: out });
			}
			break;
		}
	};

	const handle = (line: string) => {
		if (!line.startsWith("data:")) return;
		const payload = line.slice(5).trim();
		if (payload === "" || payload === "[DONE]") return;
		let json: {
			choices?: Array<{
				finish_reason?: string | null;
				delta?: {
					content?: string | null;
					reasoning?: string | null;
					reasoning_content?: string | null;
					tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }>;
				};
			}>;
		};
		try {
			json = JSON.parse(payload);
		} catch {
			return;
		}
		const choice = json.choices?.[0];
		if (!choice) return;
		const reasoning = choice.delta?.reasoning ?? choice.delta?.reasoning_content;
		if (reasoning) send({ type: "thinking", text: reasoning });
		if (choice.delta?.content) emitContent(choice.delta.content);
		for (const tc of choice.delta?.tool_calls ?? []) {
			const index = tc.index ?? calls.size;
			const slot = calls.get(index) ?? { id: tc.id ?? `call-${index}-${Date.now().toString(36)}`, name: "", args: "" };
			if (tc.id) slot.id = tc.id;
			if (tc.function?.name) slot.name = tc.function.name;
			if (tc.function?.arguments) slot.args += tc.function.arguments;
			calls.set(index, slot);
		}
		if (choice.finish_reason) finish = choice.finish_reason;
	};
	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		let nl: number;
		while ((nl = buffer.indexOf("\n")) >= 0) {
			handle(buffer.slice(0, nl).trim());
			buffer = buffer.slice(nl + 1);
		}
	}
	if (buffer.trim()) handle(buffer.trim());
	emitContent("", true);
	text = text.trim();

	const content: Anthropic.ContentBlock[] = [];
	if (text) content.push({ type: "text", text, citations: null } as Anthropic.TextBlock);
	for (const call of [...calls.values()]) {
		let input: Record<string, unknown> = {};
		try {
			input = call.args ? JSON.parse(call.args) : {};
		} catch {
			input = { raw: call.args };
		}
		content.push({ type: "tool_use", id: call.id, name: call.name, input } as Anthropic.ToolUseBlock);
	}
	return { stop_reason: calls.size > 0 || finish === "tool_calls" ? "tool_use" : "end_turn", content, model, provider: provider.id };
}
