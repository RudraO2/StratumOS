/**
 * The library as a graph. Every node is something the library holds and every link is a fact that exists:
 *
 *   document ── entity     the document states figures for that subsidiary or company   (weight = facts)
 *   document ── metric     ... of that measure
 *   document ── period     ... for that financial year
 *   topic    ── document   a passage of the document belongs to the topic
 *   document ═ document    CONFLICT: the two documents give different values for the same figure
 *
 * Nothing here is invented for the picture. A conflict is the same test the PQ builder uses for "you told
 * Parliament 186.9, the record now says 187.0"; a gap is an entity with no figure for the chosen year.
 */
import snapshot from "../../data/library.json";
import { alternatives, availablePeriods, canonical, facts as allFacts } from "../../engine/store";
import type { AskCard, FactWithDoc, PqCard, ReportCard, ToolResult } from "../../engine";
import { library } from "../../engine";

export type NodeKind = "document" | "entity" | "metric" | "period" | "topic";
export type EdgeKind = "supports" | "covers" | "about" | "conflict";

export interface GNode {
	id: string;
	kind: NodeKind;
	label: string;
	sub: string;
	r: number;
	x: number;
	y: number;
	vx: number;
	vy: number;
	/** Pinned while being dragged. */
	pinned?: boolean;
	/** Facts attached to the node. */
	facts: number;
	/** The library id (document id), the entity or metric code, the FY label, the topic id. */
	ref: string | number;
}

export interface Conflict {
	entity: string;
	metric: string;
	period: string;
	a: { documentId: number; filename: string; value: number; provisional: boolean };
	b: { documentId: number; filename: string; value: number; provisional: boolean };
}

export interface GEdge {
	id: string;
	a: string;
	b: string;
	kind: EdgeKind;
	w: number;
	conflicts?: Conflict[];
}

export interface Graph {
	nodes: GNode[];
	edges: GEdge[];
	byId: Map<string, GNode>;
	conflicts: Conflict[];
	periods: string[];
	metrics: Array<{ key: string; label: string }>;
}

interface Master {
	entities: Array<{ code: string; type: string; name: string }>;
	metrics: Array<{ key: string; label: string }>;
}
const master = (snapshot as unknown as { master: Master }).master;
const entityInfo = new Map(master.entities.map((e) => [e.code, e]));
const metricLabel = new Map(master.metrics.map((m) => [m.key, m.label]));

export const entityName = (code: string) => entityInfo.get(code)?.name ?? code;
export const metricName = (key: string) => metricLabel.get(key) ?? key.replace(/_/g, " ");
export const shortPeriod = (p: string) => p.replace(/^FY(\d{4})-(\d{2})$/, (_m, y: string, e: string) => `FY${y.slice(2)}-${e}`);

const KIND_LABEL: Record<string, string> = { annual_report: "Annual report", provisional_stats: "Provisional statistics", press_release: "Press release", coal_directory: "Coal directory", spreadsheet: "Spreadsheet", pq_reply: "Parliament reply", document: "Document" };

function docLabel(d: { filename: string; pq_number: string | null; pq_house: string | null; doc_kind: string; year: number | null }) {
	if (d.pq_number) return `${d.pq_house === "Rajya Sabha" ? "RS" : "LS"} ${d.pq_number.replace(/^Unstarred\s*/i, "")}`;
	return `${KIND_LABEL[d.doc_kind] ?? d.doc_kind}${d.year ? ` ${d.year}` : ""}`;
}

let cached: Graph | null = null;

export function buildGraph(): Graph {
	if (cached) return cached;
	const nodes = new Map<string, GNode>();
	const edges = new Map<string, GEdge>();
	const live = allFacts.filter((f) => f.status !== "rejected");

	const node = (id: string, kind: NodeKind, label: string, sub: string, ref: string | number, r: number): GNode => {
		let n = nodes.get(id);
		if (!n) {
			const angle = (nodes.size * 2.399963) % (Math.PI * 2);
			const radius = 60 + nodes.size * 7;
			n = { id, kind, label, sub, r, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, vx: 0, vy: 0, facts: 0, ref };
			nodes.set(id, n);
		}
		return n;
	};
	const link = (a: string, b: string, kind: EdgeKind, w = 1) => {
		const id = `${kind}:${a}|${b}`;
		const e = edges.get(id);
		if (e) e.w += w;
		else edges.set(id, { id, a, b, kind, w });
	};

	for (const d of library.documents()) node(`d:${d.id}`, "document", docLabel(d), d.filename, d.id, 16);
	for (const f of live) {
		const doc = nodes.get(`d:${f.document_id}`);
		if (doc) doc.facts += 1;
		const ent = node(`e:${f.entity_code}`, "entity", f.entity_code.replace("STATE:", ""), entityName(f.entity_code), f.entity_code, 12);
		ent.facts += 1;
		const met = node(`m:${f.metric}`, "metric", metricName(f.metric), f.metric, f.metric, 17);
		met.facts += 1;
		link(`d:${f.document_id}`, ent.id, "supports");
		link(`d:${f.document_id}`, met.id, "supports");
		if (f.period_kind === "fy") {
			const per = node(`p:${f.period}`, "period", shortPeriod(f.period), f.period, f.period, 10);
			per.facts += 1;
			link(`d:${f.document_id}`, per.id, "covers");
		}
	}
	for (const t of library.topics().topics) {
		const top = node(`t:${t.id}`, "topic", t.label, `${t.count} passages`, t.id, 14 + Math.min(10, t.count));
		top.facts = t.count;
		for (const ex of t.examples) if (nodes.has(`d:${ex.document_id}`)) link(top.id, `d:${ex.document_id}`, "about");
	}

	// Conflicts: same figure, different value, different document (the tolerance the PQ builder uses).
	const conflicts: Conflict[] = [];
	const seen = new Set<string>();
	for (const f of live) {
		for (const other of alternatives(f)) {
			const key = [f.id, other.id].sort((x, y) => x - y).join("-");
			if (seen.has(key) || other.document_id === f.document_id) continue;
			seen.add(key);
			const c: Conflict = {
				entity: f.entity_code,
				metric: f.metric,
				period: f.period,
				a: { documentId: f.document_id, filename: f.filename, value: f.value, provisional: !!f.is_provisional },
				b: { documentId: other.document_id, filename: other.filename, value: other.value, provisional: !!other.is_provisional },
			};
			conflicts.push(c);
			const [x, y] = [f.document_id, other.document_id].sort((p, q) => p - q);
			const id = `conflict:d:${x}|d:${y}`;
			const e = edges.get(id) ?? { id, a: `d:${x}`, b: `d:${y}`, kind: "conflict" as const, w: 0, conflicts: [] };
			e.w += 1;
			e.conflicts!.push(c);
			edges.set(id, e);
		}
	}

	for (const n of nodes.values()) {
		if (n.kind === "document") n.r = 15 + Math.sqrt(n.facts) * 1.3;
		if (n.kind === "entity") n.r = 9 + Math.sqrt(n.facts) * 1.6;
	}
	const periods = [...new Set(live.filter((f) => f.period_kind === "fy").map((f) => f.period))].sort();
	const metrics = [...new Set(live.map((f) => f.metric))].map((key) => ({ key, label: metricName(key) }));
	cached = { nodes: [...nodes.values()], edges: [...edges.values()], byId: nodes, conflicts, periods, metrics };
	return cached;
}

// ── what a chosen year and measure say about each node ──────────────────────

export type NodeState = "normal" | "gap" | "off";

/** `off`: nothing in the library for this node in the chosen year. `gap`: an entity that reports this measure in other years but not this one. */
export function stateFor(g: Graph, n: GNode, year: string, metric: string): NodeState {
	if (!year) return "normal";
	const inYear = (f: FactWithDoc) => f.period === year && f.status !== "rejected";
	switch (n.kind) {
		case "document":
			return allFacts.some((f) => f.document_id === n.ref && inYear(f)) ? "normal" : "off";
		case "entity": {
			if (canonical(metric, String(n.ref), year)) return "normal";
			const reportsElsewhere = allFacts.some((f) => f.entity_code === n.ref && f.metric === metric && f.status !== "rejected");
			return reportsElsewhere ? "gap" : "off";
		}
		case "metric":
			return allFacts.some((f) => f.metric === n.ref && inYear(f)) ? "normal" : "off";
		case "period":
			return n.ref === year ? "normal" : "off";
		default:
			return "normal";
	}
}

export function neighbours(g: Graph, id: string): Set<string> {
	const out = new Set<string>([id]);
	for (const e of g.edges) {
		if (e.a === id) out.add(e.b);
		else if (e.b === id) out.add(e.a);
	}
	return out;
}

// ── detail for the side panel ───────────────────────────────────────────────

export interface TrendPoint {
	period: string;
	fact: FactWithDoc | null;
}

/** One entity's figure for every financial year the library has for that measure: missing years stay as gaps. */
export function trend(entity: string, metric: string): TrendPoint[] {
	return availablePeriods(metric)
		.filter((p) => /^FY\d{4}-\d{2}$/.test(p))
		.map((period) => ({ period, fact: canonical(metric, entity, period) }));
}

export function entityMetrics(entity: string): string[] {
	return [...new Set(allFacts.filter((f) => f.entity_code === entity && f.status !== "rejected").map((f) => f.metric))];
}

export function documentsOf(g: Graph, id: string): GNode[] {
	const out: GNode[] = [];
	for (const e of g.edges) {
		if (e.kind === "conflict") continue;
		const other = e.a === id ? e.b : e.b === id ? e.a : null;
		const n = other ? g.byId.get(other) : undefined;
		if (n?.kind === "document") out.push(n);
	}
	return out;
}

/** The question a node turns into when the officer presses "Ask about this". */
export function questionFor(n: GNode): string | null {
	switch (n.kind) {
		case "entity":
			return `${entityName(String(n.ref))} coal production for the last 5 years`;
		case "metric": {
			const period = availablePeriods(String(n.ref)).filter((p) => /^FY\d{4}-\d{2}$/.test(p)).at(-1);
			return period ? `Subsidiary-wise ${metricName(String(n.ref)).toLowerCase()} in ${period}` : null;
		}
		case "period":
			return `Subsidiary-wise coal production in ${n.ref}`;
		case "topic": {
			const t = library.topics().topics.find((x) => x.id === n.ref);
			return t ? `What do the documents say about ${t.keywords.slice(0, 3).join(", ")}?` : null;
		}
		default:
			return null;
	}
}

// ── answer tracing ──────────────────────────────────────────────────────────

const PERIOD_IN_LABEL = /(FY\d{4}-\d{2})/;

/** The nodes an answer used: its documents, and the entities, measure and years of the figures it stated. */
export function traceOf(card: ToolResult["card"]): Set<string> {
	const ids = new Set<string>();
	const addFact = (id: number | undefined) => {
		const f = id === undefined ? undefined : allFacts.find((x) => x.id === id);
		if (!f) return;
		ids.add(`d:${f.document_id}`);
		ids.add(`e:${f.entity_code}`);
		ids.add(`m:${f.metric}`);
		if (f.period_kind === "fy") ids.add(`p:${f.period}`);
	};
	const addTable = (t: AskCard["table"]) => {
		if (!t) return;
		if (t.metric) ids.add(`m:${t.metric}`);
		for (const r of t.rows) ids.add(`e:${r.entity_code}`);
		for (const p of t.periods) {
			const m = PERIOD_IN_LABEL.exec(p);
			if (m) ids.add(`p:${m[1]}`);
		}
		for (const r of t.rows) for (const c of r.cells) addFact(c?.fact_id);
	};
	const addCitations = (cs: AskCard["citations"]) => {
		for (const c of cs) {
			ids.add(`d:${c.document_id}`);
			addFact(c.fact_id);
		}
	};
	if (card.kind === "ask") {
		const c = card as AskCard;
		addTable(c.table);
		addCitations(c.citations);
	} else if (card.kind === "pq") {
		const c = card as PqCard;
		for (const p of c.parts) addTable(p.table);
		for (const a of c.annexures) addTable(a.table);
		addCitations(c.citations);
		for (const s of c.similar) ids.add(`d:${s.document_id}`);
	} else if (card.kind === "report") {
		const c = card as ReportCard;
		for (const s of c.sections) if (s.type === "table") addTable(s.table);
		addCitations(c.citations);
	}
	return ids;
}
