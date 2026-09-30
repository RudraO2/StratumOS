/**
 * Ask: question → route → evidence bundle → composed answer → number guard. Port of ask/service.py.
 *
 * The composed answer is the model's prose; the table, the citations and the guard verdict are ours. The Python
 * backend calls its local model inside `ask()`. This engine has no model in it: `ask()` returns the answer as the
 * template states it, plus — when the model should write prose (one figure, a "why" question, documents only) — the
 * prompt to send. `resume(prose)` re-runs the assembly with the model's prose, applying the same guard and the same
 * "Insufficient verified evidence" handling.
 */
import * as domain from "./domain.ts";
import { pyFixed, pySigned } from "./domain.ts";
import * as guard from "./guard.ts";
import { parse, unknownEntity } from "./intent.ts";
import * as retrieval from "./retrieval.ts";
import { publicTable, run as runSql, toMarkdown } from "./sql.ts";
import { alternatives } from "./store.ts";
import type { AnswerTable, AskOutcome, AskPayload, Citation, Discrepancy, FactWithDoc, QueryIntent, SearchHit } from "./types.ts";

export const INSUFFICIENT = "Insufficient verified evidence available.";
export const INSUFFICIENT_HI = "पर्याप्त सत्यापित साक्ष्य उपलब्ध नहीं है।";

export const COMPOSE_SYSTEM = (insufficient: string, language: string) => `You are Stratum, answering officers of the Ministry of Coal and Coal India from verified evidence only.

Rules:
- Use ONLY the evidence below. Every figure you state must appear in the evidence table or passages, written the same way.
- Put the citation number in square brackets after each figure or claim, e.g. "SECL produced 187.00 MT [2]".
- Be brief and formal: 2–6 sentences. Name units. Say when a figure is provisional.
- If the evidence does not answer the question, reply exactly: "${insufficient}"
- Answer in ${language}.`;

export interface AskOptions {
	k?: number;
	docKinds?: string[];
	context?: string;
	/** "reply" states figures as formal sentences (the PQ builder); "list" as a compact list (chat). */
	style?: "list" | "reply";
	/** The model's metric guess, used only when the rules find none and the question wants a figure. */
	metricHint?: string | null;
}

type CiteFor = Record<number, number>;

function factCitation(n: number, fact: FactWithDoc): Citation {
	const e = domain.entity(fact.entity_code);
	const value = `${domain.formatValue(fact.value, fact.unit)} ${domain.unitLabel(fact.unit)}`.replace("% %", "%");
	const cellNote = fact.conversion ? ` (cell “${fact.raw_text}”, ${fact.conversion})` : "";
	return {
		n,
		kind: "fact",
		fact_id: fact.id,
		document_id: fact.document_id,
		filename: fact.filename,
		doc_kind: fact.doc_kind,
		page_no: fact.page_no,
		bbox: fact.bbox,
		snippet: `${e ? e.name : fact.entity_raw} · ${fact.period} · ${value}${cellNote}`,
		status: fact.status,
		provisional: Boolean(fact.is_provisional),
	};
}

function chunkCitation(n: number, chunk: SearchHit): Citation {
	let label = chunk.filename;
	if (chunk.pq_number) label = `${chunk.pq_house ?? ""} ${chunk.pq_number} (${chunk.pq_date ?? ""}) — ${chunk.filename}`.trim();
	return { n, kind: "passage", chunk_id: chunk.id, document_id: chunk.document_id, filename: label, doc_kind: chunk.doc_kind, page_no: chunk.page_no, bbox: chunk.bbox, snippet: chunk.text.slice(0, 400), heading_path: chunk.heading_path };
}

export { factCitation as citationForFact, chunkCitation as citationForChunk };

/** Periods asked for that have no figure at all, and entities missing some periods. */
function missingNote(table: AnswerTable): string {
	const empty = table.periods.filter((_, index) => !table.rows.some((r) => r.cells[index]));
	const partial = table.rows
		.filter((r) => r.cells.some((c) => c === null) && r.cells.some(Boolean))
		.map((r) => `${r.short} (${table.periods.filter((_, i) => r.cells[i] === null).join(", ")})`);
	const notes: string[] = [];
	if (empty.length > 0) notes.push(`No verified figures for ${empty.join(", ")} in the ingested documents.`);
	if (partial.length > 0 && empty.length === 0) notes.push(`Not available: ${partial.join("; ")}.`);
	return notes.join(" ");
}

const prov = (c: { provisional: boolean }) => (c.provisional ? " (provisional)" : "");

function achievementAnswer(table: AnswerTable, citeFor: CiteFor): string {
	const lines: string[] = [];
	for (const row of table.rows) {
		const bits = table.periods.flatMap((label, i) => {
			const c = row.cells[i];
			return c ? [`${label} ${c.display} ${table.unit_label}${prov(c)} [${citeFor[c.fact_id]}]`] : [];
		});
		let verdict: string;
		if (row.change_pct !== null && row.gap !== null) {
			const met = row.gap >= 0;
			verdict = ` — achievement ${pyFixed(row.change_pct, 2)}%: target ${met ? "met" : "not achieved"} (${met ? "surplus" : "shortfall"} of ${pyFixed(Math.abs(row.gap), 2)} ${table.unit_label})`;
		} else {
			verdict = " — target or actual figure not available, so achievement cannot be stated";
		}
		lines.push(`- ${row.entity}: ${bits.join("; ")}${verdict}`);
	}
	return lines.join("\n");
}

export function templateAnswer(table: AnswerTable, intent: QueryIntent, citeFor: CiteFor): string {
	if (table.kind === "achievement") {
		const body = achievementAnswer(table, citeFor);
		return body ? `${domain.metricLabel(intent.metric)}, target vs actual:\n${body}` : "";
	}
	const lines: string[] = [];
	for (const row of table.rows) {
		const parts = table.periods.flatMap((period, i) => {
			const c = row.cells[i];
			return c ? [`${c.display} ${table.unit_label} in ${period}${prov(c)} [${citeFor[c.fact_id]}]`] : [];
		});
		if (parts.length > 0) {
			const change = row.change_pct !== null ? `, a change of ${pySigned(row.change_pct, 2)}%` : "";
			lines.push(`- ${row.entity}: ${parts.join("; ")}${change}`);
		}
	}
	if (lines.length === 0) return "";
	const note = missingNote(table);
	return `${domain.metricLabel(intent.metric)}:\n${lines.join("\n")}${note ? `\n\n${note}` : ""}`;
}

const join = (parts: string[]) => (parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`);

/** The same verified figures as formal reply sentences (for Parliament replies and reports). */
export function replyAnswer(table: AnswerTable, intent: QueryIntent, citeFor: CiteFor): string {
	const label = (domain.metric(intent.metric)?.label ?? intent.metric ?? "figure").toLowerCase();
	const unit = table.unit_label;
	const sentences: string[] = [];
	for (const row of table.rows) {
		if (table.kind === "achievement") {
			const clauses: string[] = [];
			const cells = row.cells;
			for (let i = 0; i < cells.length; i += 2) {
				const parts = table.periods[i].split(" ");
				const period = parts[parts.length > 1 ? 1 : 0];
				const target = cells[i];
				const actual = i + 1 < cells.length ? cells[i + 1] : null;
				if (target && actual) {
					clauses.push(`the target for ${period} was ${target.display} ${unit}${prov(target)} [${citeFor[target.fact_id]}] against an actual of ${actual.display} ${unit}${prov(actual)} [${citeFor[actual.fact_id]}]`);
				} else if (target) {
					clauses.push(`the target for ${period} was ${target.display} ${unit} [${citeFor[target.fact_id]}], but no actual figure is available`);
				} else if (actual) {
					clauses.push(`the actual for ${period} was ${actual.display} ${unit} [${citeFor[actual.fact_id]}], but no target is on file`);
				}
			}
			if (clauses.length === 0) continue;
			let tail: string;
			if (row.change_pct !== null && row.gap !== null) {
				const met = row.gap >= 0;
				tail = `, an achievement of ${pyFixed(row.change_pct, 2)}%; the target was ${met ? "met" : "not achieved"} (${met ? "surplus" : "shortfall"} of ${pyFixed(Math.abs(row.gap), 2)} ${unit})`;
			} else {
				tail = "; the achievement cannot be stated as a figure is not available";
			}
			sentences.push(`For ${row.entity}, ${clauses.join("; ")}${tail}.`);
			continue;
		}
		const parts = table.periods.flatMap((p, i) => {
			const c = row.cells[i];
			return c ? [`${c.display} ${unit} in ${p}${prov(c)} [${citeFor[c.fact_id]}]`] : [];
		});
		if (parts.length > 0) sentences.push(`The ${label} of ${row.entity} was ${join(parts)}.`);
	}
	const note = missingNote(table);
	return sentences.join(" ") + (note && sentences.length > 0 ? ` ${note}` : "");
}

/**
 * The model writes prose for one figure or for 'why' questions. A grid of figures is stated by the template — a small
 * model reading a table with gaps is where wrong sentences come from.
 */
function needsProse(table: AnswerTable | null, intent: QueryIntent): boolean {
	if (table === null) return true;
	if (table.kind === "achievement") return false; // the verdict (met / not met, shortfall) is arithmetic
	const cells = table.rows.reduce((n, r) => n + r.cells.filter(Boolean).length, 0);
	return intent.explain || (cells <= 1 && !table.missing);
}

interface Gathered {
	question: string;
	intent: QueryIntent;
	table: AnswerTable | null;
	citations: Citation[];
	citeForFact: CiteFor;
	allowed: number[];
	discrepancies: Discrepancy[];
	wantsProse: boolean;
	write: (t: AnswerTable, i: QueryIntent, c: CiteFor) => string;
	evidence: string[];
	/** A figure was asked for, the rules named a metric, and no verified fact exists for it. */
	noFacts: boolean;
	insufficient: string;
	started: number;
}

function gather(question: string, opts: AskOptions): Gathered {
	const started = Date.now();
	const style = opts.style ?? "list";
	const write = style === "reply" ? replyAnswer : templateAnswer;
	const intent = parse(question, opts.context ?? "", opts.metricHint);
	const insufficient = intent.language === "hi" ? INSUFFICIENT_HI : INSUFFICIENT;
	const citations: Citation[] = [];
	const citeForFact: CiteFor = {};
	let table: AnswerTable | null = null;
	let passages: SearchHit[] = [];
	const allowed: number[] = domain.numbersIn(question);
	const discrepancies: Discrepancy[] = [];
	let noFacts = false;

	if (intent.route === "sql" || intent.route === "sql_rag") {
		table = runSql(intent);
		for (const fact of table.facts ?? []) {
			if (fact.id in citeForFact) continue;
			const n = citations.length + 1;
			citeForFact[fact.id] = n;
			citations.push(factCitation(n, fact));
			allowed.push(fact.value);
			for (const alt of alternatives(fact)) {
				discrepancies.push({
					entity: fact.entity_code,
					period: fact.period,
					metric: fact.metric,
					reported: fact.value,
					other: alt.value,
					other_source: alt.filename,
					other_kind: alt.doc_kind,
					pq: `${alt.pq_house ?? ""} ${alt.pq_number ?? ""} ${alt.pq_date ?? ""}`.trim() || null,
					note: Boolean(alt.is_provisional) !== Boolean(fact.is_provisional) ? "provisional vs final" : "sources disagree",
				});
			}
		}
		allowed.push(...(table.derived ?? []));
		if (table.rows.length === 0) {
			// Python falls back to the documents and lets the model decline. A figure that has no verified fact is refused here
			// outright ("Insufficient verified evidence"): documents that merely mention the topic are not a source for a number.
			// A "why" question (sql_rag) still falls back, because its documents are the answer.
			if (intent.explain) intent.notes.push("no verified facts for this metric/entity/period — falling back to documents");
			else {
				noFacts = true;
				intent.notes.push("no verified facts for this metric/entity/period");
			}
			intent.route = "rag";
			table = null;
		}
	}

	if (!noFacts && (intent.route === "rag" || intent.route === "sql_rag")) {
		let query = `${question} ${opts.context ?? ""}`.trim();
		if (intent.route === "sql_rag" && intent.metric) query = `${question} ${domain.metricLabel(intent.metric)} reasons`;
		passages = retrieval.search(query, { k: opts.k ?? 6, docKinds: opts.docKinds, excludeKinds: table ? ["table"] : undefined });
		if (!retrieval.isRelevant(passages)) passages = [];
		// "Mars Colony": a named entity the master data does not know. Documents that never mention it are not evidence about it.
		if (intent.notes.some((n) => n.includes("not in the master data"))) {
			const name = unknownEntity(question)?.toLowerCase();
			if (name) passages = passages.filter((p) => p.text.toLowerCase().includes(name));
		}
		for (const chunk of passages) {
			citations.push(chunkCitation(citations.length + 1, chunk));
			allowed.push(...domain.numbersIn(chunk.text));
		}
	}

	const evidence: string[] = [];
	if (table) evidence.push(`Evidence table — ${table.title}:\n${toMarkdown(table, citeForFact)}`);
	for (const c of citations) if (c.kind === "passage") evidence.push(`[${c.n}] ${c.filename}, page ${c.page_no}: ${c.snippet}`);

	const wantsProse = (table !== null || passages.length > 0) && needsProse(table, intent) && !(style === "reply" && table !== null && !intent.explain);
	return { question, intent, table, citations, citeForFact, allowed, discrepancies, wantsProse, write, evidence, noFacts, insufficient, started };
}

function assemble(g: Gathered, prose: string | null): AskOutcome {
	const { intent, insufficient } = g;
	let { table, citations, discrepancies } = g;
	let answer = "";
	let composedBy = "none";
	let status: "answered" | "insufficient";
	const hasEvidence = table !== null || g.citations.some((c) => c.kind === "passage");
	if (!hasEvidence) {
		answer = insufficient;
		status = "insufficient";
	} else {
		status = "answered";
		if (prose !== null && g.wantsProse && prose.trim()) {
			answer = prose.trim();
			composedBy = "llm";
		}
		if (!answer) {
			composedBy = "template";
			answer = table
				? g.write(table, intent, g.citeForFact)
				: `Relevant evidence:\n${citations.slice(0, 4).map((c) => `- ${c.snippet.slice(0, 220)}… [${c.n}]`).join("\n")}`;
		}
		if (answer.includes(insufficient.slice(0, 20)) && table === null) {
			// The model declined, possibly wrapping the refusal in a sentence; keep only the canonical text.
			answer = insufficient;
			status = "insufficient";
		} else if (answer.trim().startsWith(insufficient.slice(0, 20))) {
			status = "insufficient";
		}
	}

	if (status === "insufficient") {
		// Evidence that does not answer the question must not be shown as if it did.
		const considered = citations.length;
		table = null;
		citations = [];
		discrepancies = [];
		if (!g.noFacts) intent.notes.push(considered > 0 ? `${considered} loosely related source(s) found and set aside` : "nothing relevant in the ingested documents");
	}
	const verdict = status === "answered" ? guard.check(answer, g.allowed) : { ok: true, checked: 0, unsupported: [] };
	if (!verdict.ok && table !== null && composedBy === "llm") {
		// The model stated a figure we cannot trace. Replace the prose with the template, which states only table values.
		answer = `${g.write(table, intent, g.citeForFact)}\n\n_(The generated wording contained figures not found in the evidence and was replaced by the verified table summary.)_`;
		composedBy = "template (guard)";
	}
	const payload: AskPayload = {
		question: g.question,
		language: intent.language,
		route: intent.route,
		intent: { ...intent, notes: [...intent.notes] },
		status,
		answer,
		composed_by: composedBy,
		table: publicTable(table),
		citations,
		guard: verdict,
		discrepancies,
		seconds: Math.round((Date.now() - g.started) / 10) / 100,
	};
	const compose = prose === null && g.wantsProse && status === "answered" ? { system: COMPOSE_SYSTEM(insufficient, intent.language === "hi" ? "Hindi" : "English"), user: `Question: ${g.question}\n\nEvidence:\n${g.evidence.join("\n\n")}` } : null;
	return {
		payload,
		compose,
		templateAnswer: table ? g.write(table, intent, g.citeForFact) : payload.answer,
		allowed: g.allowed,
		citeForFact: g.citeForFact,
		guardedByTemplate: composedBy === "template (guard)",
	};
}

export interface AskRun {
	outcome: AskOutcome;
	/** Re-assemble with the model's prose. Safe to call with anything: the guard and the refusal handling are the same as in Python. */
	resume(prose: string): AskOutcome;
}

export function ask(question: string, opts: AskOptions = {}): AskRun {
	const g = gather(question, opts);
	// `assemble` mutates nothing on `g` except through copies, but the intent's notes are edited: give each call its own.
	const fresh = (): Gathered => ({ ...g, intent: { ...g.intent, notes: [...g.intent.notes] } });
	return { outcome: assemble(fresh(), null), resume: (prose) => assemble(fresh(), prose) };
}
