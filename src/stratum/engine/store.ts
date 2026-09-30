/**
 * The read side of the fact layer over the exported snapshot (facts/service.py, without the review writes).
 * The snapshot is immutable in the browser, so every lookup is a filter over 148 rows.
 */
import library from "../data/library.json" with { type: "json" };
import { entity, fyStart, metric as metricInfo, unitLabel } from "./domain.ts";
import type { ChunkRow, DocRow, FactRow, FactWithDoc, Lineage } from "./types.ts";

const snap = library as unknown as { documents: DocRow[]; facts: FactRow[]; chunks: ChunkRow[] };

export const documents: DocRow[] = snap.documents;
export const chunks: ChunkRow[] = snap.chunks;
const docById = new Map(documents.map((d) => [d.id, d]));
export const doc = (id: number) => docById.get(id);

export const facts: FactWithDoc[] = snap.facts.map((f) => {
	const d = docById.get(f.document_id)!;
	return { ...f, filename: d.filename, doc_kind: d.doc_kind, precedence: d.precedence, ingested_at: d.ingested_at, pq_house: d.pq_house, pq_number: d.pq_number, pq_date: d.pq_date };
});
const factById = new Map(facts.map((f) => [f.id, f]));

const STATUS_ORDER: Record<string, number> = { verified: 0, consistent: 1, flagged: 2 };

/** reviewed > verified > final > higher-precedence source > newest (facts/service.py CANONICAL_ORDER). */
function canonicalOrder(a: FactWithDoc, b: FactWithDoc): number {
	const reviewed = (f: FactWithDoc) => (f.reviewed === 1 && f.status !== "rejected" ? 0 : 1);
	return (
		reviewed(a) - reviewed(b) ||
		(STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3) ||
		a.is_provisional - b.is_provisional ||
		b.precedence - a.precedence ||
		b.ingested_at - a.ingested_at
	);
}

export function canonical(metric: string | null, entityCode: string, period: string): FactWithDoc | null {
	const rows = facts.filter((f) => f.metric === metric && f.entity_code === entityCode && f.period === period && f.status !== "rejected");
	if (rows.length === 0) return null;
	return [...rows].sort(canonicalOrder)[0];
}

/**
 * Other sources for the same key that disagree with the canonical value. Deliberately tight (beyond rounding):
 * a ministry answering Parliament cares that 186.9 was told to the House where 187.0 is now on file.
 */
export function alternatives(fact: FactWithDoc): FactWithDoc[] {
	const tolerance = Math.max(0.0002 * Math.abs(fact.value), 0.05);
	return facts.filter((o) => o.metric === fact.metric && o.entity_code === fact.entity_code && o.period === fact.period && o.id !== fact.id && o.status !== "rejected" && Math.abs(o.value - fact.value) > tolerance);
}

export function availablePeriods(metric: string | null): string[] {
	const set = new Set(facts.filter((f) => f.metric === metric && f.period_kind === "fy" && f.status !== "rejected").map((f) => f.period));
	return [...set].sort((a, b) => fyStart(a) - fyStart(b));
}

export const entitiesWithMetric = (metric: string | null) => [...new Set(facts.filter((f) => f.metric === metric).map((f) => f.entity_code))];
export const stateEntitiesWithMetric = (metric: string | null) => [...new Set(facts.filter((f) => f.entity_type === "state" && f.metric === metric).map((f) => f.entity_code))];

export function lineage(factId: number): Lineage | null {
	const fact = factById.get(factId);
	if (!fact) return null;
	const e = entity(fact.entity_code);
	const d = docById.get(fact.document_id)!;
	return {
		...fact,
		checks: fact.checks.map(([check_name, result, detail]) => ({ check_name, result, detail })),
		title: d.title,
		sources: [{ page_no: fact.page_no, raw_text: fact.raw_text, raw_unit: fact.raw_unit, conversion: fact.conversion, bbox: fact.bbox }],
		unit_label: unitLabel(fact.unit),
		metric_label: metricInfo(fact.metric)?.label ?? fact.metric,
		entity_name: e?.name ?? fact.entity_raw ?? fact.entity_code,
		alternatives: alternatives(fact).map((o) => ({ id: o.id, value: o.value, unit: o.unit, is_provisional: o.is_provisional, status: o.status, filename: o.filename, doc_kind: o.doc_kind, pq_house: o.pq_house, pq_number: o.pq_number, pq_date: o.pq_date })),
	} as unknown as Lineage;
}

export function listFacts(filter: { status?: string; metric?: string; entity?: string; document_id?: number; limit?: number } = {}) {
	const rows = facts.filter((f) => (!filter.status || f.status === filter.status) && (!filter.metric || f.metric === filter.metric) && (!filter.entity || f.entity_code === filter.entity) && (!filter.document_id || f.document_id === filter.document_id));
	rows.sort((a, b) => (a.status === "flagged" ? 0 : 1) - (b.status === "flagged" ? 0 : 1) || a.metric.localeCompare(b.metric) || (a.period < b.period ? 1 : a.period > b.period ? -1 : 0) || a.entity_code.localeCompare(b.entity_code));
	return rows.slice(0, filter.limit ?? 500).map((f) => ({
		id: f.id,
		entity_code: f.entity_code,
		entity_raw: f.entity_raw,
		metric: f.metric,
		value: f.value,
		unit: f.unit,
		period: f.period,
		is_provisional: f.is_provisional,
		status: f.status,
		reviewed: f.reviewed,
		filename: f.filename,
		document_id: f.document_id,
		page_no: f.page_no,
		raw_text: f.raw_text,
		bbox: f.bbox,
		unit_label: unitLabel(f.unit),
		issues: f.checks.filter(([, result]) => result === "fail" || result === "warn").map(([check, result, detail]) => ({ check, result, detail })),
	}));
}

export function summary() {
	const counts: Record<string, number> = {};
	for (const f of facts) counts[f.status] = (counts[f.status] ?? 0) + 1;
	return { total: facts.length, ...counts };
}
