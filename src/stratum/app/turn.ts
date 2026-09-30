/**
 * One turn of the workbench: classify, pick the model, then run the lane the task type names.
 *
 * ask / pq_reply / report / topics — the lane calls the tool itself from the officer's own words (no model
 *   chooses it, exactly as in the product), the engine answers from the library, and the model is asked for
 *   prose only where the answer is one figure or a "why"; its words then pass the number guard.
 * vision — the attached page goes to the vision model.
 * chat / web — a plain turn with the Stratum persona; the model may call browser_open, which the seal governs.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { os } from "../../os/kernel/store";
import { finishProse, type ToolResult } from "../engine";
import { FLEET } from "./fleet";
import { clearTurn, recordImages } from "./lib/trace/turn.js";
import { classifyRequest, scoreFleet, type TaskType } from "./router";
import { crossCheckPage, executeStratumTool, executeWebTool, laneCall } from "./tools";
import { nextTurnId, useStratum, type Block, type Turn } from "./store";

type Piece =
	| { type: "text"; text: string }
	| { type: "thinking"; text: string }
	| { type: "fallback"; provider: string; label: string; model: string; reason: string }
	| { type: "done"; stop_reason: string; content: Anthropic.ContentBlock[]; usage?: unknown; model?: string }
	| { type: "error"; message: string };

async function* streamModel(body: unknown): AsyncGenerator<Piece> {
	const response = await fetch("/api/turn", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
	if (!response.ok || !response.body) {
		let message = `${response.status} ${response.statusText}`;
		try {
			const j = await response.json();
			if (j?.error) message = String(j.error);
		} catch {
			/* not json */
		}
		yield { type: "error", message };
		return;
	}
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		let nl: number;
		while ((nl = buffer.indexOf("\n")) >= 0) {
			const line = buffer.slice(0, nl).trim();
			buffer = buffer.slice(nl + 1);
			if (line) yield JSON.parse(line) as Piece;
		}
	}
	if (buffer.trim()) yield JSON.parse(buffer) as Piece;
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runTurn(text: string, image?: { base64: string; mediaType: string; url: string }) {
	const store = useStratum.getState();
	if (store.busy) return;
	const session = store.current();
	const sessionId = session.id;
	const patch = (fn: (s: typeof session) => Partial<typeof session>) => useStratum.getState().updateSession(sessionId, fn);
	const setTurn = (id: number, fn: (t: Turn) => Turn) => patch((s) => ({ turns: s.turns.map((t) => (t.id === id ? fn(t) : t)) }));

	store.setBusy(true);
	store.setPendingImage(null);
	clearTurn();
	recordImages(image ? 1 : 0);

	// 1. The officer's message, on screen.
	const userTurn: Turn = { id: nextTurnId(), role: "user", text, image: image ? { url: image.url, mediaType: image.mediaType } : undefined };
	patch((s) => ({ turns: [...s.turns, userTurn], title: s.turns.length === 0 ? text.replace(/\s+/g, " ").slice(0, 48) : s.title }));

	// 2. Route. Classification and scoring are both recorded on the session log.
	const classification = classifyRequest(text, { hasImage: Boolean(image) });
	const n = session.turns.length + 1;
	useStratum.getState().appendEvent("router/classified", { turn: n, step: 1, ...classification });
	const routing = scoreFleet(classification.taskType);
	useStratum.getState().appendEvent("router/routed", { turn: n, step: 1, ...routing });
	patch(() => ({ routing }));
	const taskType: TaskType = classification.taskType;
	const member = routing.selected ?? FLEET[0].name;

	const assistantId = nextTurnId();
	patch((s) => ({ turns: [...s.turns, { id: assistantId, role: "assistant", blocks: [], member, taskType, done: false }] }));
	const pushBlock = (block: Block) => setTurn(assistantId, (t) => (t.role === "assistant" ? { ...t, blocks: [...t.blocks, block] } : t));
	const appendToLast = (type: "text" | "thinking", delta: string) =>
		setTurn(assistantId, (t) => {
			if (t.role !== "assistant") return t;
			const last = t.blocks[t.blocks.length - 1];
			if (last && last.type === type) return { ...t, blocks: [...t.blocks.slice(0, -1), { ...last, text: last.text + delta }] };
			return { ...t, blocks: [...t.blocks, { type, text: delta } as Block] };
		});
	const replaceBlock = (match: (b: Block) => boolean, fn: (b: Block) => Block) =>
		setTurn(assistantId, (t) => (t.role === "assistant" ? { ...t, blocks: t.blocks.map((b) => (match(b) ? fn(b) : b)) } : t));
	/** Replace the trailing text block (used when the number guard swaps model prose for the template). */
	const setLastText = (value: string) =>
		setTurn(assistantId, (t) => {
			if (t.role !== "assistant") return t;
			const i = [...t.blocks].map((b) => b.type).lastIndexOf("text");
			if (i < 0) return { ...t, blocks: [...t.blocks, { type: "text", text: value }] };
			return { ...t, blocks: t.blocks.map((b, j) => (j === i ? { type: "text", text: value } : b)) };
		});

	/** Stream one model call, appending text to the transcript; returns the final content blocks. */
	const callModel = async (body: Record<string, unknown>, options: { visible: boolean }) => {
		let final: Extract<Piece, { type: "done" }> | null = null;
		let streamed = "";
		for await (const piece of streamModel(body)) {
			if (piece.type === "text") {
				streamed += piece.text;
				if (options.visible) appendToLast("text", piece.text);
			} else if (piece.type === "thinking") {
				if (options.visible) appendToLast("thinking", piece.text);
			} else if (piece.type === "fallback") {
				os.toast({ title: "Model plane fell back.", body: `Groq did not answer (${piece.reason}). ${piece.model} via ${piece.label} is answering this turn.`, tone: "warning" });
			} else if (piece.type === "error") throw new Error(piece.message);
			else if (piece.type === "done") final = piece;
		}
		if (!final) throw new Error("the model plane closed the stream without finishing the turn");
		return { final, streamed };
	};

	const remember = (answer: string) =>
		patch((s) => ({ api: [...s.api, { role: "user", content: text }, { role: "assistant", content: answer || "(no text)" }] }));

	try {
		const call = laneCall(taskType, text);
		if (call) {
			// ── the lane: a synthetic tool call from the officer's words ───────────────
			const blockId = `lane-${assistantId}`;
			pushBlock({ type: "card", id: blockId, tool: call.tool, input: call.input, status: "running" });
			await pause(350);
			let { result, produced } = executeStratumTool(call.tool, call.input);
			const show = (r: ToolResult, extra: Record<string, unknown> = {}) =>
				replaceBlock(
					(b) => b.type === "card" && b.id === blockId,
					(b) => (b.type === "card" ? { ...b, status: r.ok ? "done" : "error", card: r.card, produced, error: r.ok ? undefined : r.text, ...extra } : b),
				);
			show(result);
			let answer = result.final ?? "";
			if (result.composeParts && result.resume) {
				// A PQ: the parts that need prose each get a model call; the rest are already stated.
				const prose: Record<string, string> = {};
				for (const part of result.composeParts) {
					const { streamed } = await callModel({ mode: "compose", language: "en", messages: [{ role: "user", content: part.compose.user }] }, { visible: false });
					prose[part.label] = streamed;
				}
				result = result.resume(prose);
				show(result);
				answer = result.final ?? result.templateAnswer;
				pushBlock({ type: "text", text: answer });
			} else if (result.final) {
				pushBlock({ type: "text", text: result.final });
			} else if (result.compose) {
				const language = result.card.kind === "ask" ? result.card.language : "en";
				pushBlock({ type: "text", text: "" });
				const { streamed } = await callModel({ mode: "compose", language, messages: [{ role: "user", content: result.compose.user }] }, { visible: false });
				const done = finishProse(result, streamed);
				setLastText(done.text);
				show(done.result, { guard: done.guard, composedBy: done.composedBy });
				answer = done.text;
			} else {
				pushBlock({ type: "text", text: result.text });
				answer = result.text;
			}
			remember(answer);
		} else if (taskType === "vision" && image) {
			// ── the vision lane: the page goes to the vision model ─────────────────────
			const content: Anthropic.ContentBlockParam[] = [
				{ type: "image", source: { type: "base64", media_type: image.mediaType as "image/png", data: image.base64 } },
				{ type: "text", text },
			];
			const { streamed } = await callModel({ mode: "vision", messages: [{ role: "user", content }] }, { visible: true });
			const check = crossCheckPage(streamed);
			if (check.checked > 0) {
				pushBlock({
					type: "note",
					tone: check.matched === check.checked ? "ok" : "warn",
					text: `${check.matched} of ${check.checked} figures on this page match a verified figure in the library. Read by the vision model; a figure with no match has not been checked against any source.`,
				});
			}
			remember(streamed);
		} else {
			// ── a plain turn; the model may call browser_open, and the seal answers ────
			let history: Anthropic.MessageParam[] = [...useStratum.getState().current().api, { role: "user", content: text }];
			for (let step = 0; step < 4; step += 1) {
				const { final } = await callModel({ mode: "chat", messages: history }, { visible: true });
				history = [...history, { role: "assistant", content: final.content as Anthropic.ContentBlockParam[] }];
				const uses = final.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
				if (final.stop_reason !== "tool_use" || uses.length === 0) break;
				const results: Anthropic.ToolResultBlockParam[] = [];
				for (const use of uses) {
					const input = (use.input ?? {}) as Record<string, unknown>;
					pushBlock({ type: "tool", id: use.id, name: use.name, input, status: "running" });
					const outcome = await executeWebTool(use.name, input);
					replaceBlock(
						(b) => b.type === "tool" && b.id === use.id,
						(b) => (b.type === "tool" ? { ...b, status: outcome.status, result: outcome.content } : b),
					);
					results.push({ type: "tool_result", tool_use_id: use.id, content: outcome.content, is_error: outcome.isError });
				}
				history = [...history, { role: "user", content: results }];
			}
			patch(() => ({ api: history }));
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		setTurn(assistantId, (t) => (t.role === "assistant" ? { ...t, error: message } : t));
	} finally {
		setTurn(assistantId, (t) => (t.role === "assistant" ? { ...t, done: true } : t));
		useStratum.getState().setBusy(false);
	}
}
