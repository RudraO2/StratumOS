/**
 * The model plane's only server piece: one function that holds the keys and
 * streams a turn back as NDJSON. Stateless — the browser sends the whole
 * conversation every time and runs the tool loop itself, because the simulated
 * workstation the tools act on lives in the browser.
 *
 * Primary plane: Groq. Fallback plane: Gemini API (Gemma 4). See `_providers.ts`.
 * Modes (see `_prompts.ts`): chat (may call browser_open), vision (page image), compose (prose from evidence).
 * The fallback takes a turn only when the primary fails before producing
 * anything, and the browser is told with a `fallback` piece.
 *
 * Wire format, one JSON object per line:
 *   { type: "text", text }            a text delta
 *   { type: "thinking", text }        a reasoning delta
 *   { type: "fallback", provider, label, model, reason }   the fallback plane took the turn
 *   { type: "done", stop_reason, content, model, provider }   raw assistant blocks, echoed back verbatim next turn
 *   { type: "error", message }
 */
import type Anthropic from "@anthropic-ai/sdk";
import { systemPromptFor, type Mode } from "./_prompts.js";
import { providers, streamTurn, type Member } from "./_providers.js";

async function handler(req: Request): Promise<Response> {
	if (req.method !== "POST") {
		return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: { "content-type": "application/json" } });
	}
	const { primary, fallback } = providers();
	if (!primary.key && !fallback.key) {
		return new Response(JSON.stringify({ error: "No model plane is configured: set GROQ_API_KEY (and GEMINI_API_KEY for the fallback) on the server" }), { status: 500, headers: { "content-type": "application/json" } });
	}

	let body: { mode?: Mode; language?: string; messages?: Anthropic.MessageParam[]; provider?: "groq" | "gemini" };
	try {
		body = await req.json();
	} catch {
		return new Response(JSON.stringify({ error: "body must be JSON" }), { status: 400, headers: { "content-type": "application/json" } });
	}
	const mode: Mode = body.mode === "vision" || body.mode === "compose" ? body.mode : "chat";
	const member: Member = mode === "vision" ? "vision" : "text";
	const messages = Array.isArray(body.messages) ? body.messages : [];
	const system = systemPromptFor(mode, { now: new Date(), language: body.language });
	const useTools = mode === "chat";
	const forced = body.provider === "gemini" ? fallback : body.provider === "groq" ? primary : null;

	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			let sentAny = false;
			const send = (obj: unknown) => {
				const t = (obj as { type?: string }).type;
				sentAny = sentAny || t === "text" || t === "thinking";
				controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
			};
			const run = async (p: typeof primary) => {
				// The fallback model must not repeat the primary's identity line.
				const prompt =
					p.id === fallback.id
						? `${system}\n\nNOTE: You are the fallback plane for this turn — ${p.models[member]} on the ${p.label} — because Groq did not answer. If asked which model is answering, say that.`
						: system;
				const result = await streamTurn(p, member, prompt, messages, send, { tools: useTools });
				send({ type: "done", stop_reason: result.stop_reason, content: result.content, model: result.model, provider: result.provider });
			};
			try {
				if (forced) {
					await run(forced);
					return;
				}
				if (!primary.key) {
					send({ type: "fallback", provider: fallback.id, label: fallback.label, model: fallback.models[member], reason: "GROQ_API_KEY is not set" });
					await run(fallback);
					return;
				}
				try {
					await run(primary);
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					// Fall back only if nothing reached the browser yet, so no text is duplicated.
					if (fallback.key && !sentAny) {
						send({ type: "fallback", provider: fallback.id, label: fallback.label, model: fallback.models[member], reason: message.length > 140 ? message.slice(0, 140) + "…" : message });
						await run(fallback);
					} else {
						throw error;
					}
				}
			} catch (error) {
				send({ type: "error", message: error instanceof Error ? error.message : String(error) });
			} finally {
				controller.close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			"content-type": "application/x-ndjson; charset=utf-8",
			"cache-control": "no-cache, no-transform",
			"x-accel-buffering": "no",
		},
	});
}

/** Vercel reads a default-exported *function* as the Node (req, res) signature; the
 *  `{ fetch }` object is what selects the web-standard Request/Response handler. */
export default { fetch: handler };
