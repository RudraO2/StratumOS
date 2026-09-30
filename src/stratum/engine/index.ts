/**
 * The Stratum engine — the contract the UI is built against.
 *
 * A pure, synchronous TypeScript port of the Python backend's deterministic logic (domain rules, the semantic layer,
 * canonical facts, the number guard, Ask, the PQ reply builder, the report engine, topics) over the exported library
 * snapshot. There is no model in here: where the Python backend calls its local model, the engine returns the
 * prompt (`compose`) and accepts the prose back (`resume` / `finishProse`).
 */
import snapshot from "../data/library.json" with { type: "json" };
import metricsSnapshot from "../data/metrics.json" with { type: "json" };
import { INSUFFICIENT, ask } from "./ask.ts";
import { DOCX_MIME } from "./docx.ts";
import * as guard from "./guard.ts";
import { buildPq } from "./pq.ts";
import { generate, pickTemplate, templates } from "./reports.ts";
import * as store from "./store.ts";
import type { AskCard, FinishedProse, GuardVerdict, MetricsPayload, PqCard, ReportCard, ToolName, ToolResult, TopicsCard, TopicsPayload } from "./types.ts";

export type * from "./types.ts";
export { SAMPLE_PQ_TEXT, SAMPLE_QUESTIONS } from "./samples.ts";
export type { SampleQuestion } from "./samples.ts";
export { ask as askRaw } from "./ask.ts";
export { buildPq, parsePqHeader, parseQuestion } from "./pq.ts";
export { generate as generateReport, pickTemplate } from "./reports.ts";
export { parse as parseIntent } from "./intent.ts";
export { DOCX_MIME };

export const TOOL_NAMES: ToolName[] = ["stratum_ask", "stratum_pq_reply", "stratum_report", "stratum_topics"];

/** Separates the answer from the sources in a tool result's text; what is above it is the reply. */
export const SOURCES_MARKER = "\n\n---\nSources:";

export function guardCheck(text: string, allowed: number[]): GuardVerdict {
	return guard.check(text, allowed);
}

const short = (text: unknown, n = 70) => {
	const flat = String(text ?? "").replace(/\s+/g, " ").trim();
	return flat.length > n ? `${flat.slice(0, n - 1)}…` : flat;
};

function sourcesBlock(citations: Array<{ n: number; filename: string; page_no: number | null; snippet: string }>): string {
	if (!citations || citations.length === 0) return "";
	const lines = citations.slice(0, 12).map((c) => `[${c.n}] ${short(c.filename, 80)}${c.page_no ? ` p.${c.page_no}` : ""} — ${short(c.snippet, 110)}`);
	return `${SOURCES_MARKER}\n${lines.join("\n")}`;
}

const fmt = (n: number) => String(Number(n.toPrecision(6)));

/** An answer with notes for anything a careful officer would want to know before relying on it. */
function askText(card: AskCard): string {
	const parts = [String(card.answer ?? "").trim() || INSUFFICIENT];
	for (const d of card.discrepancies ?? []) parts.push(`Note: ${d.entity} ${d.period} — ${d.other_source}${d.pq ? ` (${d.pq})` : ""} states ${fmt(d.other)}, against ${fmt(d.reported)} used here (${d.note}).`);
	if (card.guard && card.guard.ok === false) parts.push(`Warning: figures not found in the evidence: ${card.guard.unsupported.join(", ")}.`);
	return parts.join("\n\n") + sourcesBlock(card.citations);
}

const DELIVERABLES_DIR = "Documents\\Deliverables";

function pqText(card: PqCard): string {
	const h = card.header ?? {};
	const lines = [`Draft reply prepared for ${[h.pq_house, h.pq_number].filter(Boolean).join(" ")}${h.pq_date ? ` (${h.pq_date})` : ""}${h.pq_subject ? ` — ${h.pq_subject}` : ""}.`];
	for (const part of card.parts) lines.push(`(${part.label}) ${String(part.answer ?? "").replace(/\s*\[\d+\]/g, "").trim()}`);
	if (card.warnings.length > 0) {
		lines.push(`Review before sending — ${card.warnings.length} note${card.warnings.length === 1 ? "" : "s"}:`);
		for (const w of card.warnings) lines.push(`• ${w.message}`);
	}
	if (card.docx_path) lines.push(`Draft saved as ${DELIVERABLES_DIR}\\${card.docx_path}.`);
	return lines.join("\n\n") + sourcesBlock(card.citations);
}

/** What the assistant says under a PQ card: a short summary, not the whole document again. */
function pqSummary(card: PqCard): string {
	const h = card.header ?? {};
	const answered = card.parts.filter((p) => p.status === "answered").length;
	const head = `Drafted the reply to ${[h.pq_house, h.pq_number].filter(Boolean).join(" ") || "the question"}: ${answered} of ${card.parts.length} part${card.parts.length === 1 ? "" : "s"} answered from verified evidence.`;
	const notes = card.warnings.length > 0 ? ` ${card.warnings.length} point${card.warnings.length === 1 ? "" : "s"} to review before sending — ${card.warnings.map((w) => w.message).join(" ")}` : " Nothing to review.";
	return `${head}${notes}${card.docx_path ? ` The draft is in ${DELIVERABLES_DIR}\\${card.docx_path}.` : ""}`;
}

function reportText(card: ReportCard): string {
	const lines = [`Report "${card.title}" generated from verified facts.`];
	for (const s of card.sections) if (s.type === "narrative" && s.text) lines.push(s.text.replace(/\s*\[\d+\]/g, ""));
	const g = card.guard;
	lines.push(`Number guard: ${g.checked ?? 0} figures checked, ${g.unsupported ?? 0} unsupported.`);
	if (card.docx_path) lines.push(`Report saved as ${DELIVERABLES_DIR}\\${card.docx_path}.`);
	return lines.join("\n\n") + sourcesBlock(card.citations);
}

function topicsText(card: TopicsCard): string {
	if (card.status !== "ok") return card.message ?? "Topics have not been built yet.";
	const lines = [`${card.topics.length} topics found across ${card.chunks} passages from ${card.documents} documents:`];
	for (const t of card.topics.slice(0, 8)) lines.push(`• ${t.label} — ${t.count} passages (${t.keywords.slice(0, 4).join(", ")})`);
	return lines.join("\n");
}

function failure(tool: ToolName, message: string): ToolResult {
	const card = { kind: "ask", question: "", language: "en", route: "rag", intent: { route: "rag", metric: null, entities: [], periods: [], scope: "specific", compare: false, explain: false, achievement: false, language: "en", source: "rules", notes: [] }, status: "insufficient", answer: message, composed_by: "none", table: null, citations: [], guard: { ok: true, checked: 0, unsupported: [] }, discrepancies: [], seconds: 0 } as AskCard;
	return { ok: false, tool, text: message, final: message, compose: null, templateAnswer: message, allowed: [], card };
}

const requireString = (input: Record<string, unknown>, key: string) => (typeof input?.[key] === "string" && (input[key] as string).trim() !== "" ? (input[key] as string) : null);

function runAsk(input: Record<string, unknown>): ToolResult {
	const question = requireString(input, "question");
	if (!question) return failure("stratum_ask", "invalid question: expected a non-empty string");
	const hint = typeof input.metric === "string" ? input.metric : null;
	const run = ask(question, { metricHint: hint });
	const build = (o: typeof run.outcome): ToolResult => {
		const card: AskCard = { kind: "ask", ...o.payload };
		const text = askText(card);
		return {
			ok: true,
			tool: "stratum_ask",
			text,
			final: o.compose ? null : text.split(SOURCES_MARKER)[0],
			compose: o.compose,
			templateAnswer: o.templateAnswer,
			allowed: o.allowed,
			card,
		};
	};
	const result = build(run.outcome);
	result.resume = (prose) => build(run.resume(typeof prose === "string" ? prose : Object.values(prose).join("\n")));
	return result;
}

function runPq(input: Record<string, unknown>, prose: Record<string, string> = {}): ToolResult {
	const text = requireString(input, "text");
	if (!text) return failure("stratum_pq_reply", "invalid text: expected the full text of the question");
	const built = buildPq(text, prose);
	const card: PqCard = { kind: "pq", ...built.payload };
	const pending = built.pending.map((p) => ({ label: p.label, compose: p.compose }));
	const result: ToolResult = {
		ok: true,
		tool: "stratum_pq_reply",
		text: pqText(card),
		final: pending.length > 0 ? null : pqSummary(card),
		compose: null,
		templateAnswer: pqSummary(card),
		allowed: [],
		card,
		deliverable: built.deliverable,
		composeParts: pending.length > 0 ? pending : undefined,
	};
	result.resume = (proseIn) => runPq(input, typeof proseIn === "string" ? Object.fromEntries(pending.map((p) => [p.label, proseIn])) : { ...prose, ...proseIn });
	return result;
}

function runReport(input: Record<string, unknown>): ToolResult {
	const request = requireString(input, "request");
	if (!request) return failure("stratum_report", "invalid request: expected a non-empty string");
	let [templateId, params] = pickTemplate(request);
	const named = typeof input.template === "string" && templates().some((t) => t.id === input.template) ? (input.template as string) : null;
	if (named) templateId = named;
	const built = generate(templateId, params);
	const card: ReportCard = { kind: "report", ...built.payload };
	const narrativeText = card.sections.flatMap((s) => (s.type === "narrative" && s.text ? [s.text.replace(/\s*\[\d+\]/g, "")] : [])).join(" ");
	const final = `Generated “${card.title}” from verified facts. ${narrativeText} Number guard: ${card.guard.checked} figures checked, ${card.guard.unsupported} unsupported. The report is in ${DELIVERABLES_DIR}\\${card.docx_path}.`;
	return { ok: true, tool: "stratum_report", text: reportText(card), final, compose: null, templateAnswer: final, allowed: [], card, deliverable: built.deliverable };
}

function runTopics(): ToolResult {
	const card: TopicsCard = { kind: "topics", ...topicsPayload() };
	const text = topicsText(card);
	return { ok: true, tool: "stratum_topics", text, final: text, compose: null, templateAnswer: text, allowed: [], card };
}

export function runTool(name: ToolName, input: Record<string, unknown> = {}): ToolResult {
	try {
		switch (name) {
			case "stratum_ask":
				return runAsk(input);
			case "stratum_pq_reply":
				return runPq(input);
			case "stratum_report":
				return runReport(input);
			case "stratum_topics":
				return runTopics();
			default:
				return failure("stratum_ask", `Unknown tool "${String(name)}".`);
		}
	} catch (error) {
		return failure(name, error instanceof Error ? error.message : String(error));
	}
}

/**
 * The model wrote prose for a result whose `compose` (or, for a PQ, `composeParts`) was set. Runs it through the number
 * guard and the refusal handling exactly as Ask does, and returns the updated result to show.
 */
export function finishProse(result: ToolResult, prose: string | Record<string, string>): FinishedProse {
	if (!result.resume) return { text: result.final ?? result.text, guard: { ok: true, checked: 0, unsupported: [] }, composedBy: "template", result };
	const updated = result.resume(prose);
	const card = updated.card;
	let guardVerdict: GuardVerdict = { ok: true, checked: 0, unsupported: [] };
	let composedBy = "template";
	if (card.kind === "ask") {
		guardVerdict = card.guard;
		composedBy = card.composed_by;
	} else if (card.kind === "pq") {
		const parts = card.parts;
		guardVerdict = { ok: parts.every((p) => p.guard.ok), checked: parts.reduce((n, p) => n + p.guard.checked, 0), unsupported: parts.flatMap((p) => p.guard.unsupported) };
		composedBy = "llm";
	}
	const text = card.kind === "ask" ? card.answer : (updated.final ?? updated.text);
	return { text, guard: guardVerdict, composedBy, result: updated };
}

// ── the library, for a window onto it ─────────────────────────────────────────

function topicsPayload(): TopicsPayload {
	return (snapshot as unknown as { topics: TopicsPayload }).topics;
}

export const libraryView = {
	documents: () => store.documents,
	facts: (filter: { status?: string; metric?: string; entity?: string; document_id?: number } = {}) => store.listFacts(filter),
	lineage: (id: number) => store.lineage(id),
	summary: () => store.summary(),
	topics: (): TopicsPayload => topicsPayload(),
	/** The Metrics tab, exactly as the running backend computed it on this corpus (extraction vs the gold set, routing, guard, automation). */
	metrics: (): MetricsPayload => metricsSnapshot as unknown as MetricsPayload,
	templates: () => templates().map((t) => ({ id: t.id, title: t.title, description: t.description })),
};

export { libraryView as library };
