/**
 * PQ Reply Builder: a parliamentary question → a draft reply, part by part. Port of pq/service.py.
 *
 * 1. Parse the header (House, Starred/Unstarred No., date, subject) and parts (a), (b), (c)…
 * 2. Answer each part through Ask, carrying the previous part forward for "if so, the details thereof" parts.
 * 3. Tables longer than a few rows become Annexures, as ministry replies do.
 * 4. Find similar questions already answered (the PQ archive) and compare every figure in this draft with figures
 *    previously given to Parliament.
 * 5. Write the draft in reply format as DOCX, with an internal evidence trail.
 */
import { ask } from "./ask.ts";
import { fmtG, pyTitle } from "./domain.ts";
import { DOCX_MIME, DocxBuilder, tableRows } from "./docx.ts";
import * as retrieval from "./retrieval.ts";
import type { Citation, PqPart, PqPayload, PqSimilar, PqWarning, AnswerTable } from "./types.ts";

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
const FOLLOW_ON = /^\s*(if so|if not|the details thereof|details thereof|the reasons therefor|and the reasons|if yes|if no)/i;

export interface PqHeader {
	pq_house?: string;
	pq_number?: string;
	pq_date?: string;
	pq_subject?: string;
}

/** ingest/doc_meta.py parse_pq_header */
export function parsePqHeader(text: string): PqHeader {
	const out: PqHeader = {};
	const house = /\b(LOK\s+SABHA|RAJYA\s+SABHA)\b/i.exec(text);
	if (house) out.pq_house = pyTitle(house[1]).replace("  ", " ");
	const number = /\b(?:UN)?STARRED\s+QUESTION\s+NO\.?\s*[:\-]?\s*([\d*†]+)/i.exec(text);
	if (number) {
		const starred = /UNSTARRED/i.test(number[0]) ? "Unstarred" : "Starred";
		out.pq_number = `${starred} ${number[1].replace(/^[*†]+|[*†]+$/g, "")}`;
	}
	const date = /ANSWERED\s+ON\s*[:\-]?\s*([0-9]{1,2}[.\-/ ][0-9A-Za-z]{1,9}[.\-/ ,]*[0-9]{2,4})/i.exec(text);
	if (date) out.pq_date = date[1].trim();
	let subject = /ANSWERED\s+ON[^\n]*\n+\s*([A-Z][A-Z0-9 ,&'()\-/]{6,120})\s*\n/.exec(text);
	if (!subject) {
		// Layout engines often merge the header into one line: "TO BE ANSWERED ON 10.03.2025 SAFETY IN COAL MINES"
		subject = /ANSWERED\s+ON\s*[:\-]?\s*\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}\s+([A-Z][A-Z0-9 ,&'()\-/]{5,120}?)\s*(?:\n|$)/.exec(text);
	}
	if (subject) out.pq_subject = pyTitle(subject[1].trim());
	return out;
}

export function parseQuestion(text: string) {
	const header = parsePqHeader(text);
	let body = text;
	const lead = /will\s+the\s+minister\s+of\s+[a-z &]+?\s+be\s+pleased\s+to\s+state\s*[:\-]?/i.exec(text);
	if (lead) body = text.slice(lead.index + lead[0].length);
	const parts: Array<{ label: string; question: string }> = [];
	for (const match of body.matchAll(/\(([a-h])\)\s*(.+?)(?=\([a-h]\)\s|$)/gs)) {
		let question = match[2].replace(/\s+/g, " ").trim().replace(/;+$/, "").replace(/,+$/, "").trim();
		question = question.replace(/\s*(and|;)\s*$/, "");
		if (question) parts.push({ label: match[1], question });
	}
	if (parts.length === 0) parts.push({ label: "a", question: body.replace(/\s+/g, " ").trim() });
	const members = text.match(/(?:SHRI|SMT\.?|DR\.?|KUMARI)\s+[A-Z][A-Z .]+/g) ?? [];
	let subject: string | null | undefined = header.pq_subject;
	if (!subject) {
		const caps = [...text.matchAll(/^\s*([A-Z][A-Z ,&'()\-]{8,80})\s*$/gm)].map((m) => m[1]).filter((c) => !/LOK SABHA|RAJYA SABHA|QUESTION|MINISTRY|GOVERNMENT|ANSWERED|SHRI|SMT/.test(c));
		subject = caps.length > 0 ? pyTitle(caps[0]) : null;
	}
	return { ...header, pq_subject: subject, members: members.slice(0, 4).map((m) => pyTitle(m.trim())), parts };
}

function similar(text: string): PqSimilar[] {
	const hits = retrieval.search(text, { k: 12, docKinds: ["pq_reply"] });
	const seen = new Set<number>();
	const out: PqSimilar[] = [];
	for (const hit of hits) {
		if (seen.has(hit.document_id)) continue;
		seen.add(hit.document_id);
		out.push({ document_id: hit.document_id, filename: hit.filename, house: hit.pq_house, number: hit.pq_number, date: hit.pq_date, subject: hit.pq_subject ?? hit.title, page_no: hit.page_no, snippet: hit.text.slice(0, 300), similarity: hit.vector_sim });
		if (out.length >= 3) break;
	}
	return out;
}

/** A short stable hash for deliverable file names (sha1 is async in a browser; FNV-1a is enough for a name). */
export function shortHash(text: string): string {
	let h1 = 0x811c9dc5;
	let h2 = 0x01000193;
	for (let i = 0; i < text.length; i++) {
		h1 = Math.imul(h1 ^ text.charCodeAt(i), 0x01000193) >>> 0;
		h2 = Math.imul(h2 + text.charCodeAt(i), 0x85ebca6b) >>> 0;
	}
	return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).slice(0, 8);
}

export interface PqBuild {
	payload: PqPayload;
	/** Parts the model should write prose for (documents-only or "why" parts); empty once they are supplied. */
	pending: Array<{ label: string; compose: { system: string; user: string } }>;
	deliverable: { name: string; mime: string; bytes: Uint8Array };
}

export function buildPq(text: string, proseByLabel: Record<string, string> = {}): PqBuild {
	const started = Date.now();
	const parsed = parseQuestion(text);
	const subject = parsed.pq_subject ?? "";
	const answers: PqPart[] = [];
	const annexures: PqPayload["annexures"] = [];
	const citationsAll: Citation[] = [];
	let warnings: PqWarning[] = [];
	const pending: PqBuild["pending"] = [];
	let previous = "";

	for (const part of parsed.parts) {
		let query = part.question;
		if (FOLLOW_ON.test(query) && previous) query = `${previous} — ${query}`;
		// The subject line and the previous part may name the entity or year a part leaves implicit — never the metric.
		const context = [subject, previous].filter(Boolean).join(" ");
		const run = ask(query, { context, style: "reply" });
		let outcome = run.outcome;
		if (outcome.compose) {
			if (proseByLabel[part.label]) outcome = run.resume(proseByLabel[part.label]);
			else pending.push({ label: part.label, compose: outcome.compose });
		}
		const result = outcome.payload;
		// Renumber this part's citations into the reply-wide list.
		const offset = citationsAll.length;
		const renumber = new Map(result.citations.map((c) => [c.n, c.n + offset]));
		for (const c of result.citations) citationsAll.push({ ...c, n: renumber.get(c.n)!, part: part.label });
		let answer = result.answer.replace(/\[(\d+)\]/g, (_, n) => `[${renumber.get(Number(n)) ?? n}]`);
		if (result.table && result.table.rows.length > 3) {
			const annexure = { label: `Annexure-${ROMAN[annexures.length]}`, part: part.label, table: result.table as AnswerTable };
			annexures.push(annexure);
			answer = `${answer}\n\nThe details are given at ${annexure.label}.`;
		}
		for (const d of result.discrepancies) {
			if (d.other_kind === "pq_reply") {
				warnings.push({ part: part.label, kind: "past_reply_mismatch", message: `${d.entity} ${d.metric.replace(/_/g, " ")} ${d.period}: this draft states ${fmtG(d.reported)}, but ${d.pq || d.other_source} stated ${fmtG(d.other)} (${d.note}).`, ...d });
			} else {
				warnings.push({ part: part.label, kind: "source_disagreement", message: `${d.entity} ${d.period}: ${d.other_source} states ${fmtG(d.other)} vs ${fmtG(d.reported)} used here (${d.note}).`, ...d });
			}
		}
		if (!result.guard.ok) warnings.push({ part: part.label, kind: "unsupported_number", message: `Part (${part.label}): figures not found in evidence: ${result.guard.unsupported.map(fmtG).join(", ")}` });
		if (result.status === "insufficient") warnings.push({ part: part.label, kind: "insufficient", message: `Part (${part.label}): no verified evidence found — needs officer input.` });
		answers.push({ label: part.label, question: part.question, answer, route: result.route, status: result.status, table: result.table, guard: result.guard });
		previous = part.question;
	}

	// The same discrepancy often surfaces in several parts; say it once, naming every part it touches.
	const merged = new Map<string, PqWarning>();
	for (const w of warnings) {
		const key = `${w.kind}\u0000${w.message}`;
		const existing = merged.get(key);
		if (existing) existing.part = `${existing.part}, ${w.part}`;
		else merged.set(key, { ...w });
	}
	warnings = [...merged.values()];

	const header = { pq_house: parsed.pq_house, pq_number: parsed.pq_number, pq_date: parsed.pq_date, pq_subject: parsed.pq_subject };
	const name = `PQ-reply-${shortHash(text)}.docx`;
	const payload: PqPayload = { header, members: parsed.members, parts: answers, annexures, similar: similar(text), warnings, citations: citationsAll, seconds: null, docx_path: name };
	const bytes = writeDocx(payload);
	payload.seconds = Math.round((Date.now() - started) / 10) / 100;
	return { payload, pending, deliverable: { name, mime: DOCX_MIME, bytes } };
}

function writeDocx(payload: PqPayload): Uint8Array {
	const header = payload.header;
	const doc = new DocxBuilder();
	doc.title = `${header.pq_house ?? "Lok Sabha"} ${header.pq_number ?? "question"} — draft reply`;
	doc.centered("GOVERNMENT OF INDIA");
	doc.centered("MINISTRY OF COAL");
	doc.centered((header.pq_house || "LOK SABHA").toUpperCase());
	const numberText = header.pq_number || "Unstarred ____";
	const sp = numberText.indexOf(" ");
	const kind = sp < 0 ? numberText : numberText.slice(0, sp);
	const number = sp < 0 ? "" : numberText.slice(sp + 1);
	doc.centered(`${kind.toUpperCase()} QUESTION NO. ${number || "____"}`);
	doc.centered(`TO BE ANSWERED ON ${header.pq_date || "____"}`);
	doc.centered((header.pq_subject || "SUBJECT").toUpperCase());
	doc.blank();
	for (const member of payload.members.slice(0, 2)) doc.paragraph(`${member}:`, { bold: true });
	doc.paragraph("Will the Minister of COAL be pleased to state:");
	for (const part of payload.parts) doc.paragraph(`(${part.label}) ${part.question};`);
	doc.blank();
	doc.centered("ANSWER");
	doc.centered("THE MINISTER OF COAL AND MINES (SHRI ____________)", { bold: true });
	doc.blank();
	for (const part of payload.parts) doc.paragraph(`(${part.label}): ${part.answer}`);
	for (const annexure of payload.annexures) {
		doc.pageBreak();
		doc.centered(annexure.label.toUpperCase());
		doc.paragraph(`Annexure referred to in reply to part (${annexure.part}) of ${header.pq_house || "Lok Sabha"} ${header.pq_number || "Question"} for ${header.pq_date || "____"}`, { italic: true });
		const [head, rows] = tableRows(annexure.table);
		doc.table(head, rows, annexure.table.title);
	}
	if (payload.warnings.length > 0) {
		doc.pageBreak();
		doc.paragraph("Stratum review notes (internal — remove before dispatch)", { bold: true });
		for (const w of payload.warnings) doc.paragraph(`• ${w.message}`, { size: 10 });
	}
	doc.evidenceSection(payload.citations);
	return doc.build();
}
