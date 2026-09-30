/**
 * Report engine: template → verified tables + (chart data) + guarded narrative → DOCX. Port of reports/service.py.
 *
 * Every section pulls verified facts through the same semantic layer Ask uses, so every figure is cited. The
 * narrative is stated by a template from the verified table (a small model asked to describe a table with a total
 * row calls the total a "contributor"); the number guard still checks every figure it finds.
 */
import library from "../data/library.json" with { type: "json" };
import { citationForChunk, citationForFact } from "./ask.ts";
import * as domain from "./domain.ts";
import { pyFixed, pyRound, pySigned } from "./domain.ts";
import { DOCX_MIME, DocxBuilder, tableRows } from "./docx.ts";
import * as guard from "./guard.ts";
import { newIntent } from "./intent.ts";
import { shortHash } from "./pq.ts";
import * as retrieval from "./retrieval.ts";
import { publicTable, run as runSql } from "./sql.ts";
import { availablePeriods, canonical } from "./store.ts";
import type { AnswerTable, Citation, FactWithDoc, ReportPayload, ReportSection } from "./types.ts";

interface TemplateSection {
	type: string;
	text?: string;
	metric?: string | string[];
	entities?: string | string[];
	periods?: string;
	period?: string;
	kind?: string;
	about?: string;
	target?: string;
	actual?: string;
	query?: string;
}
interface Template {
	id: string;
	title: string;
	description: string;
	params?: Record<string, unknown>;
	sections: TemplateSection[];
}

export const templates = (): Template[] => (library as unknown as { templates: Template[] }).templates;

type Params = Record<string, any>;

function periodsFor(spec: string, metric: string, params: Params): string[] {
	const available = availablePeriods(metric);
	if (available.length === 0) return [];
	const latest = params.period !== undefined && params.period !== null && params.period !== "latest" ? (params.period as string) : available[available.length - 1];
	if (spec === "latest") return [latest];
	let m = /^latest-(\d+)\.\.latest$/.exec(spec);
	if (m) {
		const start = domain.fyStart(latest) - parseInt(m[1], 10);
		const out: string[] = [];
		for (let y = start; y <= domain.fyStart(latest); y++) out.push(domain.fyLabel(y));
		return out;
	}
	m = /^last:(\d+)$/.exec(spec);
	if (m) {
		const upto = available.filter((p) => domain.fyStart(p) <= domain.fyStart(latest));
		return upto.slice(-parseInt(m[1], 10));
	}
	return [spec];
}

function entitiesFor(spec: string | string[] | undefined, params: Params): string[] {
	if (spec === "subsidiaries") return [...domain.cilSubsidiaries(), "CIL"];
	if (spec === "subsidiaries_only") return domain.cilSubsidiaries();
	const list = Array.isArray(spec) ? spec : [spec as string];
	return list.map((e) => (e === "{entity}" ? (params.entity ?? "CIL") : e));
}

const fill = (text: string, params: Params) => text.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined && params[k] !== null ? String(params[k]) : m));

const TOTAL_CODES = new Set(["CIL", "ALL_INDIA"]);

interface TargetRow {
	entity: string;
	target: number | null;
	actual: number | null;
	achievement_pct: number | null;
	cites: Array<number | null>;
}
type LastTable = { target: true; rows: TargetRow[]; title: string; periods: string[]; unit_label: string } | AnswerTable;

/** Report wording, stated by the template from the verified table. Returns the text and the derived figures it states. */
export function narrative(table: LastTable, citeFor: Record<number, number>): [string, number[]] {
	const extra: number[] = [];
	if ("target" in table) {
		const rows = table.rows.filter((r) => r.achievement_pct !== null);
		const parts = rows.filter((r) => !TOTAL_CODES.has(r.entity));
		if (parts.length === 0) return ["", extra];
		const met = parts.filter((r) => (r.achievement_pct as number) >= 100);
		const short = parts.filter((r) => (r.achievement_pct as number) < 100).sort((a, b) => (a.achievement_pct as number) - (b.achievement_pct as number));
		const period = table.periods[0] ?? "";
		let text = `In ${period}, ${met.length} of ${parts.length} subsidiaries met or exceeded their production target`;
		if (met.length > 0) text += ` (${met.map((r) => `${r.entity} ${pyFixed(r.achievement_pct as number, 2)}%`).join(", ")})`;
		if (short.length > 0) text += `; the largest shortfall was ${short[0].entity} at ${pyFixed(short[0].achievement_pct as number, 2)}% of target`;
		const total = rows.find((r) => TOTAL_CODES.has(r.entity));
		if (total) {
			const cites = total.cites.length > 0 ? total.cites : [null, null];
			const tRef = cites[0] ? ` [${cites[0]}]` : "";
			const aRef = cites[1] ? ` [${cites[1]}]` : "";
			text += `. Coal India overall achieved ${pyFixed(total.achievement_pct as number, 2)}% of its ${pyFixed(total.target as number, 2)} MT target${tRef}, producing ${pyFixed(total.actual as number, 2)} MT${aRef}.`;
		} else {
			text += ".";
		}
		return [text, extra];
	}

	const periods = table.periods;
	if (periods.length === 0 || table.rows.length === 0) return ["", extra];
	const last = periods.length - 1;
	const label = domain.metricLabel(table.metric).toLowerCase();
	const unit = table.unit_label;
	const ref = (c: { fact_id: number }) => ` [${citeFor[c.fact_id] ?? "?"}]`;
	const total = table.rows.find((r) => TOTAL_CODES.has(r.entity_code) && r.cells[last]);
	const subs = new Set(domain.cilSubsidiaries());
	const parts = table.rows.filter((r) => subs.has(r.entity_code) && r.cells[last]);

	if (parts.length >= 3) {
		let text = "";
		if (total) {
			const cell = total.cells[last]!;
			text = `In ${periods[last]}, ${total.entity} recorded ${label} of ${cell.display} ${unit}${ref(cell)}`;
			if (periods.length >= 2 && total.change_pct !== null) text += `, ${pySigned(total.change_pct, 2)}% against ${periods[0]}`;
			text += ". ";
		}
		const big = parts.reduce((a, b) => (b.cells[last]!.value > a.cells[last]!.value ? b : a));
		const small = parts.reduce((a, b) => (b.cells[last]!.value < a.cells[last]!.value ? b : a));
		const bc = big.cells[last]!;
		const sc = small.cells[last]!;
		text += `Among the subsidiaries, ${big.short} was the largest at ${bc.display} ${unit}${ref(bc)}`;
		if (total && total.cells[last]!.value) {
			const share = (bc.value / total.cells[last]!.value) * 100;
			extra.push(pyRound(share, 1), pyRound(share, 2));
			text += ` (${pyFixed(share, 1)}% of the total)`;
		}
		text += ` and ${small.short} the smallest at ${sc.display} ${unit}${ref(sc)}.`;
		return [text, extra];
	}

	const row = table.rows[0];
	const filled = periods.flatMap((p, i) => (row.cells[i] ? [[p, row.cells[i]!] as const] : []));
	if (filled.length >= 2) {
		const [p0, c0] = filled[0];
		const [p1, c1] = filled[filled.length - 1];
		const [peakP, peakC] = filled.reduce((a, b) => (b[1].value > a[1].value ? b : a));
		let text = `From ${p0} to ${p1}, ${label} of ${row.entity} moved from ${c0.display} ${unit}${ref(c0)} to ${c1.display} ${unit}${ref(c1)}`;
		if (row.change_pct !== null) text += `, a change of ${pySigned(row.change_pct, 2)}%`;
		text += `; the highest year was ${peakP} at ${peakC.display} ${unit}${ref(peakC)}.`;
		return [text, extra];
	}
	if (filled.length > 0) {
		const [p, c] = filled[0];
		return [`${row.entity} recorded ${label} of ${c.display} ${unit} in ${p}${ref(c)}.`, extra];
	}
	return ["", extra];
}

export interface ReportBuild {
	payload: ReportPayload;
	deliverable: { name: string; mime: string; bytes: Uint8Array };
}

export function generate(templateId: string, paramsIn: Params = {}): ReportBuild {
	const started = Date.now();
	const template = templates().find((t) => t.id === templateId);
	if (!template) throw new Error(`unknown report template "${templateId}"`);
	const params: Params = { ...(template.params ?? {}), ...paramsIn };
	const metricKey: string = params.metric ?? "coal_production";
	if (params.metric_label === undefined) params.metric_label = domain.metricLabel(metricKey);
	const ent = domain.entity(params.entity ?? "CIL");
	if (params.entity_name === undefined) params.entity_name = ent ? ent.name : params.entity;
	if (params.period === undefined || params.period === null || params.period === "latest") {
		const available = availablePeriods("coal_production");
		params.period = available.length > 0 ? available[available.length - 1] : "latest";
	}

	const doc = new DocxBuilder();
	const title = fill(template.title, params);
	doc.title = title;
	doc.centered("STRATUM — AUTOMATED REPORT", { size: 10 });
	doc.centered(title, { size: 14 });
	doc.centered(`Generated ${new Date().toLocaleString("en-GB", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })} from verified facts. Every figure is traceable to its source (see Evidence trail).`, { bold: false, size: 9 });
	doc.blank();

	const citations: Citation[] = [];
	const citeFor: Record<number, number> = {};
	const sections: ReportSection[] = [];
	let lastTable: LastTable | null = null;
	const allowed: number[] = [];
	let unsupportedTotal = 0;
	let checkedTotal = 0;

	const cite = (fact: FactWithDoc) => {
		if (!(fact.id in citeFor)) {
			citeFor[fact.id] = citations.length + 1;
			citations.push(citationForFact(citeFor[fact.id], fact));
		}
		return citeFor[fact.id];
	};

	for (const section of template.sections) {
		switch (section.type) {
			case "heading": {
				const text = fill(section.text ?? "", params);
				doc.heading(text);
				sections.push({ type: "heading", text });
				break;
			}
			case "table": {
				const metric = fill(section.metric as string, params);
				const intent = newIntent({ route: "sql", metric, entities: entitiesFor(section.entities, params), periods: periodsFor(fill(section.periods ?? "latest", params), metric, params), compare: true });
				const table = runSql(intent);
				for (const fact of table.facts ?? []) {
					cite(fact);
					allowed.push(fact.value);
				}
				allowed.push(...(table.derived ?? []));
				lastTable = table;
				if (table.rows.length > 0) {
					const [head, rows] = tableRows(table);
					doc.table(head, rows, table.title);
				} else {
					doc.paragraph("Insufficient verified evidence available for this table.", { italic: true });
				}
				sections.push({ type: "table", table: publicTable(table)! });
				break;
			}
			case "target_table": {
				const found = periodsFor(section.period ?? "latest", section.actual as string, params);
				const period = found.length > 0 ? found[found.length - 1] : (params.period as string);
				const rows: string[][] = [];
				const target: LastTable = { target: true, rows: [], title: `Target vs achievement ${period}`, periods: [period], unit_label: "MT" };
				for (const code of entitiesFor(section.entities, params)) {
					const t = canonical(section.target as string, code, period);
					const a = canonical(section.actual as string, code, period);
					if (!t && !a) continue;
					const pct = t && a && t.value ? pyRound((a.value / t.value) * 100, 2) : null;
					let tRef: number | null = null;
					let aRef: number | null = null;
					if (t) {
						tRef = cite(t);
						allowed.push(t.value);
					}
					if (a) {
						aRef = cite(a);
						allowed.push(a.value);
					}
					if (pct !== null) allowed.push(pct);
					rows.push([code, t ? pyFixed(t.value, 2) : "—", a ? pyFixed(a.value, 2) : "—", pct !== null ? `${pyFixed(pct, 2)}%` : "—"]);
					target.rows.push({ entity: code, target: t ? t.value : null, actual: a ? a.value : null, achievement_pct: pct, cites: [tRef, aRef] });
				}
				lastTable = target;
				if (rows.length > 0) doc.table(["Entity", `Target ${period} (MT)`, `Actual ${period} (MT)`, "Achievement"], rows, `Production target vs achievement, ${period}`);
				else doc.paragraph("Insufficient verified evidence available: no target figures have been extracted yet.", { italic: true });
				sections.push({ type: "target_table", rows: target.rows, period });
				break;
			}
			case "chart": {
				const metrics = Array.isArray(section.metric) ? section.metric : [fill(section.metric as string, params)];
				const series: Record<string, Array<[string, number]>> = {};
				for (const metric of metrics) {
					const periods = periodsFor(fill(section.periods ?? "latest", params), metric, params);
					for (const code of entitiesFor(section.entities, params)) {
						for (const period of periods) {
							const fact = canonical(metric, code, period);
							if (!fact) continue;
							if (section.kind === "line") (series[code] ??= []).push([period, fact.value]);
							else {
								const lab = metrics.length > 1 ? domain.metricLabel(metric) : period;
								(series[lab] ??= []).push([code, fact.value]);
							}
						}
					}
				}
				if (Object.keys(series).length > 0) {
					// The Python engine draws a matplotlib PNG into the .docx; a browser has no plotting library here, so the
					// document carries the plotted values as a table and the UI draws the chart from `series`.
					const names = Object.keys(series);
					const labels = [...new Set(names.flatMap((n) => series[n].map(([x]) => x)))];
					doc.table(["", ...names], labels.map((l) => [l, ...names.map((n) => { const v = series[n].find(([x]) => x === l); return v ? pyFixed(v[1], 2) : "—"; })]), `Chart data — ${title}`);
					sections.push({ type: "chart", kind: section.kind ?? "bar", series });
				}
				break;
			}
			case "narrative": {
				if (lastTable && lastTable.rows.length > 0) {
					let [text, derived] = narrative(lastTable, citeFor);
					allowed.push(...derived);
					const verdict = text ? guard.check(text, allowed) : { ok: true, checked: 0, unsupported: [] };
					if (!text) text = "See the table above.";
					unsupportedTotal += verdict.unsupported.length;
					checkedTotal += verdict.checked;
					doc.paragraph(text);
					sections.push({ type: "narrative", text, guard: verdict });
				}
				break;
			}
			case "evidence": {
				const query = fill(section.query ?? "", params);
				const hits = retrieval.search(query, { k: 4, excludeKinds: ["table"] }).filter((h) => retrieval.isRelevant([h]));
				if (hits.length === 0) doc.paragraph("No supporting narrative evidence found in the library.", { italic: true });
				for (const hit of hits) {
					const n = citations.length + 1;
					citations.push(citationForChunk(n, hit));
					doc.paragraph(`“${hit.text.slice(0, 500).trim()}…” [${n}]`, { keepCitations: true, size: 10 });
				}
				sections.push({ type: "evidence", passages: citations.filter((c) => c.kind === "passage").map((c) => ({ n: c.n, snippet: c.snippet, filename: c.filename, page_no: c.page_no })) });
				break;
			}
		}
	}

	doc.evidenceSection(citations, "Evidence trail");
	const name = `Report-${shortHash(`${templateId}|${JSON.stringify(paramsIn)}`)}.docx`;
	const payload: ReportPayload = {
		template: templateId,
		title,
		params,
		sections,
		citations,
		docx_path: name,
		guard: { ok: unsupportedTotal === 0, checked: checkedTotal, unsupported: unsupportedTotal },
		seconds: Math.round((Date.now() - started) / 10) / 100,
	};
	return { payload, deliverable: { name, mime: DOCX_MIME, bytes: doc.build() } };
}

/** Which template a free-text request asks for, and its parameters. */
export function pickTemplate(text: string): [string, Params] {
	const low = text.toLowerCase();
	const params: Params = {};
	const periods = domain.findPeriods(text);
	if (periods.length > 0 && !periods[0].startsWith("LAST:")) params.period = periods[periods.length - 1];
	if (/target|achievement/.test(low)) return ["target_vs_achievement", params];
	if (/trend|over the (last|past)|years|historical/.test(low)) {
		const entities = domain.findEntities(text);
		if (entities.length > 0) params.entity = entities[0];
		const metric = domain.findMetric(text);
		if (metric && metric !== "growth_pct" && metric !== "achievement_pct") params.metric = metric;
		const n = /(\d{1,2})\s+years/.exec(low);
		if (n) params.years = parseInt(n[1], 10);
		return ["multi_year_trend", params];
	}
	return ["subsidiary_annual_production", params];
}
