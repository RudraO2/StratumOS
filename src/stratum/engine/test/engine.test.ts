/**
 * Engine tests. Run: `npm run test:engine` (plain node, no build step).
 *
 *  - the gold set (38 questions, 100 facts) measured the way backend/stratum/metrics/service.py measures it
 *  - parity against the Python backend's own recorded outputs (test/fixtures/parity.json)
 *  - every sample prompt the UI offers, run for real
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { unzipSync } from "fflate";
import * as domain from "../domain.ts";
import { ask } from "../ask.ts";
import { check } from "../guard.ts";
import { parse } from "../intent.ts";
import { runTool, finishProse, SAMPLE_QUESTIONS, SAMPLE_PQ_TEXT, library } from "../index.ts";
import { parsePqHeader, buildPq } from "../pq.ts";
import * as retrieval from "../retrieval.ts";
import { run as runSql } from "../sql.ts";
import { canonical } from "../store.ts";
import type { AskCard, PqCard, ReportCard } from "../types.ts";

const read = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const gold = read("gold.json") as { facts: Array<{ entity: string; metric: string; period: string; value: number }>; questions: Array<{ q: string; route: string; expect?: number[] }> };
const parity = read("parity.json");
const pct = (n: number, d: number) => (d ? Math.round((1000 * n) / d) / 10 : null);
const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.005 * Math.abs(b), 0.011);

test("gold: extraction (canonical facts vs hand-checked values)", () => {
	let matched = 0;
	let wrong = 0;
	let missing = 0;
	for (const g of gold.facts) {
		const f = canonical(g.metric, g.entity, g.period);
		if (!f) missing++;
		else if (near(f.value, g.value)) matched++;
		else wrong++;
	}
	console.log(`  extraction exact-match ${pct(matched, gold.facts.length)}%  (${matched}/${gold.facts.length}, wrong ${wrong}, missing ${missing})  [Python: 99.0%]`);
	assert.equal(matched, parity.metrics.extraction.matched);
	assert.equal(wrong, parity.metrics.extraction.wrong);
});

test("gold: routing (sql / rag / sql_rag) over 38 labelled questions", () => {
	const bad = gold.questions.filter((q) => parse(q.q).route !== q.route);
	console.log(`  routing ${pct(gold.questions.length - bad.length, gold.questions.length)}%  (${gold.questions.length - bad.length}/${gold.questions.length})  [Python: 100%]`);
	for (const q of bad) console.log(`    MISROUTED "${q.q}" expected ${q.route}, got ${parse(q.q).route}`);
	assert.equal(bad.length, 0);
});

test("gold: numeric answers (the SQL route returns exactly the expected figures)", () => {
	const scored = gold.questions.filter((q) => q.expect);
	let right = 0;
	for (const q of scored) {
		const intent = parse(q.q);
		const table = intent.metric ? runSql(intent) : { rows: [], derived: [] };
		const values = [...table.rows.flatMap((r) => r.cells.filter(Boolean).map((c) => c!.value)), ...(table.derived ?? [])];
		const ok = q.expect!.every((e) => values.some((v) => near(v, e)));
		if (ok) right++;
		else console.log(`    WRONG "${q.q}" expected ${q.expect}, got ${values.slice(0, 12)}`);
	}
	console.log(`  numeric ${pct(right, scored.length)}%  (${right}/${scored.length})  [Python: 100%]`);
	assert.equal(right, scored.length);
});

test("gold: every route=rag question finds passages; nothing is invented", () => {
	const rag = gold.questions.filter((q) => q.route === "rag" || q.route === "sql_rag");
	const dry: string[] = [];
	for (const q of rag) {
		const { outcome } = ask(q.q);
		if (outcome.payload.status !== "answered" || outcome.payload.citations.length === 0) dry.push(q.q);
		assert.ok(outcome.payload.guard.ok, q.q);
	}
	console.log(`  documents found for ${rag.length - dry.length}/${rag.length} document questions`);
	for (const q of dry) console.log(`    NO EVIDENCE "${q}"`);
	assert.equal(dry.length, 0);
});

test("relevance gate: out-of-corpus questions are refused, not answered from loosely related passages", () => {
	for (const q of ["What is the capital of France?", "Give me a recipe for biryani", "Who won the cricket world cup?", "What is the weather in Mumbai today?", "What is the coal production of Mars Colony in 2024?"]) {
		const { outcome } = ask(q);
		assert.equal(outcome.payload.status, "insufficient", q);
		assert.equal(outcome.payload.answer, "Insufficient verified evidence available.");
		assert.equal(outcome.payload.citations.length, 0);
	}
});

test("parity: Ask payloads against the Python backend's recorded answers", () => {
	const cases: Array<[string, string]> = [
		["Compare subsidiary-wise coal production FY2023-24 vs FY2024-25", parity.ask.compare.answer],
		["Did SECL achieve its production target in FY2023-24?", parity.ask.achievement.answer],
	];
	for (const [q, expected] of cases) {
		const { outcome } = ask(q);
		assert.equal(outcome.payload.answer, expected, q);
		assert.equal(outcome.payload.route, "sql");
	}
	// one figure: the model writes the sentence, from this evidence
	const single = ask("What was the coal production of CCL in FY2023-24?");
	assert.ok(single.outcome.compose, "a single figure asks the model for prose");
	assert.equal(single.outcome.payload.table!.rows[0].cells[0]!.display, "86.10");
	const done = single.resume(parity.ask.single.answer);
	assert.equal(done.payload.answer, parity.ask.single.answer);
	assert.equal(done.payload.composed_by, "llm");
	assert.equal(done.payload.guard.ok, true);
	// the model refuses
	const refused = ask("What is the coal production of Mars Colony in 2024?");
	assert.equal(refused.outcome.payload.status, "insufficient");
	assert.equal(refused.outcome.payload.route, "rag");
	// "why": figures and documents
	const why = ask("Why was offtake affected by rake availability?");
	assert.equal(why.outcome.payload.route, "sql_rag");
	assert.ok(why.outcome.compose);
	assert.ok(why.outcome.payload.citations.some((c) => c.kind === "passage"));
});

test("guard: an invented figure is replaced by the verified table, a Devanagari digit cannot slip through", () => {
	const run = ask("What was the coal production of CCL in FY2023-24?");
	const lying = run.resume("CCL produced 91.40 MT in FY2023-24 [1].");
	assert.equal(lying.payload.composed_by, "template (guard)");
	assert.equal(lying.payload.guard.ok, false);
	assert.ok(lying.payload.answer.includes("86.10"));
	assert.equal(check("CCL ने ८६.१० MT उत्पादन किया", [86.1]).ok, true);
	assert.equal(check("CCL ने ९१.४० MT उत्पादन किया", [86.1]).ok, false);
	assert.equal(check("In FY2023-24 (2023-24), three subsidiaries [2]: 1,234.50", [1234.5]).ok, true);
});

test("pq: header, parts, the past-reply mismatch, annexures, docx", () => {
	assert.deepEqual(parsePqHeader(SAMPLE_PQ_TEXT), parity.pq.header);
	const built = buildPq(SAMPLE_PQ_TEXT);
	const p = built.payload;
	assert.equal(p.parts.length, 3);
	assert.equal(p.parts[0].answer, parity.pq.parts[0].answer);
	assert.equal(p.parts[1].answer, parity.pq.parts[1].answer);
	assert.deepEqual(p.members, parity.pq.members);
	const mismatch = p.warnings.find((w) => w.kind === "past_reply_mismatch");
	assert.ok(mismatch, "the past-reply mismatch fires");
	assert.equal(mismatch!.message, parity.pq.warnings[0].message);
	assert.equal(mismatch!.part, "a, b");
	assert.ok(p.warnings.some((w) => w.kind === "source_disagreement" && w.message === parity.pq.warnings[1].message));
	// part (c) is documents only: the model writes it
	assert.equal(built.pending.map((x) => x.label).join(), "c");
	const zip = unzipSync(built.deliverable.bytes);
	const xml = new TextDecoder().decode(zip["word/document.xml"]);
	assert.ok(xml.includes("COAL PRODUCTION BY SECL") && xml.includes("Stratum review notes"));
	assert.match(built.deliverable.name, /^PQ-reply-[0-9a-f]{8}\.docx$/);
	// resume with prose for (c) reaches the reply
	const res = runTool("stratum_pq_reply", { text: SAMPLE_PQ_TEXT });
	assert.ok(res.composeParts?.length === 1 && res.final === null);
	const fin = finishProse(res, { c: "The Government has expedited clearances and first mile connectivity projects [1]." });
	assert.ok((fin.result.card as PqCard).parts[2].answer.includes("first mile"));
	assert.ok(fin.result.final);
});

test("reports: three templates, narrative parity with the Python engine, guard clean", () => {
	const want: Record<string, any> = Object.fromEntries(parity.reports.map((r: any) => [r.template, r]));
	for (const [request, id] of [
		["Generate the production target vs achievement report for 2023-24", "target_vs_achievement"],
		["Generate the subsidiary-wise annual production and offtake report", "subsidiary_annual_production"],
		["Generate a coal production trend report for Coal India over the last 5 years", "multi_year_trend"],
	] as const) {
		const r = runTool("stratum_report", { request });
		const card = r.card as ReportCard;
		assert.equal(card.template, id);
		assert.equal(card.title, want[id].title, id);
		assert.equal(card.guard.ok, true);
		assert.equal(card.guard.unsupported, 0);
		assert.deepEqual(card.sections.map((s) => s.type), want[id].sections.map((s: any) => s.type), `${id} sections`);
		const narr = card.sections.filter((s) => s.type === "narrative").map((s: any) => s.text);
		const wantNarr = want[id].sections.filter((s: any) => s.type === "narrative").map((s: any) => s.text);
		assert.deepEqual(narr, wantNarr, `${id} narrative`);
		assert.ok(unzipSync(r.deliverable!.bytes)["word/document.xml"]);
	}
});

test("topics + library views", () => {
	const t = runTool("stratum_topics");
	assert.equal(t.ok, true);
	assert.ok(t.text.includes("topics found"));
	assert.equal(library.documents().length, 8);
	assert.equal(library.summary().total, 148);
	assert.equal(library.facts({ status: "flagged" }).length, 1);
	const flagged = library.facts({ status: "flagged" })[0];
	assert.ok(library.lineage(flagged.id)!.checks.some((c) => c.result === "fail"));
	assert.equal(library.metrics().extraction.exact_match_pct, 99);
});

test("domain: entities, periods, numbers", () => {
	assert.deepEqual(domain.findEntities("Compare S.E.C.L. and South Eastern Coalfields Ltd. with Coal India"), ["SECL", "CIL"]);
	assert.deepEqual(domain.findPeriods("between 2019-20 and 2021-22"), ["FY2019-20", "FY2020-21", "FY2021-22"]);
	assert.deepEqual(domain.findPeriods("FY24 and 2022-23"), ["FY2023-24", "FY2022-23"]);
	assert.deepEqual(domain.findPeriods("the last three years"), ["LAST:3"]);
	assert.equal(domain.parseNumber("(12.5)"), -12.5);
	assert.equal(domain.parseNumber("1,23,456.7"), 123456.7);
	assert.equal(domain.parseNumber("62.01."), 62.01);
	assert.equal(domain.parseNumber("NA"), null);
	assert.deepEqual(domain.numbersIn("१८७.०० और 1,234.5"), [187, 1234.5]);
	assert.equal(domain.fmtG(186.9), "186.9");
	assert.equal(domain.fmtG(187), "187");
	assert.equal(domain.pyFixed(0.125, 2), "0.12");
	assert.equal(domain.formatValue(1234.5, "million_tonnes"), "1,234.50");
});

test("sample prompts: every one the UI offers runs and shows what it says it shows", () => {
	const outcomes: string[] = [];
	for (const s of SAMPLE_QUESTIONS) {
		const tool = s.kind === "ask" ? "stratum_ask" : s.kind === "pq" ? "stratum_pq_reply" : s.kind === "report" ? "stratum_report" : "stratum_topics";
		const input = s.kind === "ask" ? { question: s.text } : s.kind === "pq" ? { text: s.text } : s.kind === "report" ? { request: s.text } : {};
		const r = runTool(tool, input);
		assert.equal(r.ok, true, s.label);
		const card = r.card;
		if (card.kind === "ask") {
			const refusal = /Mars/.test(s.text);
			assert.equal(card.status, refusal ? "insufficient" : "answered", s.label);
			if (!refusal) assert.ok(card.citations.length > 0, s.label);
			assert.equal(card.guard.ok, true, s.label);
			if (card.table) assert.ok(card.table.rows.length > 0, s.label);
			outcomes.push(`${s.label}: ${card.route}, ${card.table ? card.table.rows.length + " rows" : "no table"}, ${card.citations.length} cites${r.compose ? ", model prose" : ""}`);
		} else if (card.kind === "pq") {
			assert.ok(card.warnings.some((w) => w.kind === "past_reply_mismatch"), s.label);
			outcomes.push(`${s.label}: ${card.parts.length} parts, ${card.warnings.length} review notes`);
		} else if (card.kind === "report") {
			assert.equal(card.guard.ok, true, s.label);
			outcomes.push(`${s.label}: ${card.template}, ${card.guard.checked} figures checked`);
		} else outcomes.push(`${s.label}: ${card.topics.length} topics`);
	}
	console.log(outcomes.map((o) => "    " + o).join("\n"));
});

test("retrieval: a question about something in the library ranks the right document first", () => {
	const top = (q: string) => retrieval.search(q, { k: 3 })[0]?.filename;
	assert.match(top("coal stocks at pitheads rake availability") ?? "", /provisional-coal-statistics/);
	assert.match(top("Mission Coking Coal") ?? "", /ls-usq|rs-usq|annual-report|press/);
});

test("a figure with no verified fact is refused, not answered from passages that merely mention the topic", () => {
	for (const q of ["What was the overburden removal of CIL last year?", "What is the production target of Coal India for 2024-25?"]) {
		const { outcome } = ask(q);
		assert.equal(outcome.payload.status, "insufficient", q);
		assert.equal(outcome.payload.citations.length, 0, q);
		assert.equal(outcome.compose, null, q);
	}
});

test("the model's metric hint is used only when the rules find none and the question wants a figure", () => {
	const hinted = runTool("stratum_ask", { question: "how much coal did ECL produce in 2023-24", metric: "coal_production" });
	assert.equal((hinted.card as AskCard).route, "sql");
	assert.equal((hinted.card as AskCard).intent.source, "rules+llm");
	const ignored = runTool("stratum_ask", { question: "What steps were taken for safety in mines?", metric: "coal_production" });
	assert.equal((ignored.card as AskCard).route, "rag");
});
