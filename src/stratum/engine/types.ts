/**
 * Types for the Stratum engine: a pure, synchronous TypeScript port of the Python backend's
 * deterministic logic (ask / facts / pq / reports / topics) over the exported library snapshot.
 * Card shapes mirror the Python payloads (see plugins/stratum-ui/test/fixtures/backend.json).
 */

export type ToolName = "stratum_ask" | "stratum_pq_reply" | "stratum_report" | "stratum_topics";

// ── snapshot rows ─────────────────────────────────────────────────────────────

export interface DocRow {
	id: number;
	filename: string;
	doc_kind: string;
	title: string | null;
	year: number | null;
	language: string;
	precedence: number;
	is_provisional: number;
	pq_house: string | null;
	pq_number: string | null;
	pq_date: string | null;
	pq_subject: string | null;
	pages: number;
	ingested_at: number;
}

export interface FactRow {
	id: number;
	entity_code: string;
	entity_type: string | null;
	entity_raw: string | null;
	metric: string;
	value: number;
	unit: string;
	period: string;
	period_kind: string | null;
	is_provisional: number;
	status: "verified" | "consistent" | "flagged" | "rejected";
	reviewed: number;
	document_id: number;
	page_no: number | null;
	raw_text: string | null;
	raw_unit: string | null;
	conversion: string | null;
	bbox: number[] | null;
	checks: Array<[string, string, string]>;
}

/** A fact joined with its document (what `facts.canonical()` returns in Python). */
export interface FactWithDoc extends FactRow {
	filename: string;
	doc_kind: string;
	precedence: number;
	ingested_at: number;
	pq_house: string | null;
	pq_number: string | null;
	pq_date: string | null;
}

export interface ChunkRow {
	id: number;
	document_id: number;
	page_no: number | null;
	heading_path: string | null;
	text: string;
	kind: string;
}

export interface SearchHit extends ChunkRow {
	filename: string;
	title: string | null;
	doc_kind: string;
	year: number | null;
	pq_house: string | null;
	pq_number: string | null;
	pq_date: string | null;
	pq_subject: string | null;
	bbox: number[] | null;
	score: number;
	vector_sim: number; // kept for shape parity: a normalised BM25 similarity here
	lexical_rank: number | null;
	matched?: string[];
	nTerms?: number;
}

// ── intent / table / answer ──────────────────────────────────────────────────

export interface QueryIntent {
	route: "sql" | "rag" | "sql_rag";
	metric: string | null;
	entities: string[];
	periods: string[];
	scope: "specific" | "subsidiaries" | "states" | "all";
	compare: boolean;
	explain: boolean;
	achievement: boolean;
	language: "en" | "hi";
	source: string;
	notes: string[];
}

export interface Cell {
	fact_id: number;
	value: number;
	display: string;
	status: string;
	provisional: boolean;
	reviewed: boolean;
}

export interface TableRowOut {
	entity_code: string;
	entity: string;
	short: string;
	cells: Array<Cell | null>;
	change_pct: number | null;
	gap: number | null;
}

export interface AnswerTable {
	title: string;
	kind: "values" | "achievement";
	metric: string | null;
	unit: string;
	unit_label: string;
	periods: string[];
	rows: TableRowOut[];
	show_change: boolean;
	change_label: string;
	missing: number;
	/** Engine-only; stripped from public cards. */
	facts?: FactWithDoc[];
	derived?: number[];
}

export interface Citation {
	n: number;
	kind: "fact" | "passage";
	fact_id?: number;
	chunk_id?: number;
	document_id: number;
	filename: string;
	doc_kind: string;
	page_no: number | null;
	bbox: number[] | null;
	snippet: string;
	status?: string;
	provisional?: boolean;
	heading_path?: string | null;
	part?: string;
}

export interface Discrepancy {
	entity: string;
	period: string;
	metric: string;
	reported: number;
	other: number;
	other_source: string;
	other_kind: string;
	pq: string | null;
	note: string;
}

export interface GuardVerdict {
	ok: boolean;
	checked: number;
	unsupported: number[];
}

export interface AskPayload {
	question: string;
	language: "en" | "hi";
	route: string;
	intent: QueryIntent;
	status: "answered" | "insufficient";
	answer: string;
	composed_by: string;
	table: AnswerTable | null;
	citations: Citation[];
	guard: GuardVerdict;
	discrepancies: Discrepancy[];
	seconds: number;
}

/** What `ask()` returns inside the engine: the public payload plus what the tool layer needs. */
export interface AskOutcome {
	payload: AskPayload;
	/** Non-null when the model should write prose from this evidence. */
	compose: { system: string; user: string } | null;
	templateAnswer: string;
	allowed: number[];
	citeForFact: Record<number, number>;
	/** Number of figure cells in the table (for the UI). */
	guardedByTemplate: boolean;
}

// ── PQ ───────────────────────────────────────────────────────────────────────

export interface PqPart {
	label: string;
	question: string;
	answer: string;
	route: string;
	status: string;
	table: AnswerTable | null;
	guard: GuardVerdict;
}

export interface PqWarning {
	part: string;
	kind: "past_reply_mismatch" | "source_disagreement" | "unsupported_number" | "insufficient";
	message: string;
	[k: string]: unknown;
}

export interface PqSimilar {
	document_id: number;
	filename: string;
	house: string | null;
	number: string | null;
	date: string | null;
	subject: string | null;
	page_no: number | null;
	snippet: string;
	similarity: number;
}

export interface PqPayload {
	header: { pq_house?: string; pq_number?: string; pq_date?: string; pq_subject?: string | null };
	members: string[];
	parts: PqPart[];
	annexures: Array<{ label: string; part: string; table: AnswerTable }>;
	similar: PqSimilar[];
	warnings: PqWarning[];
	citations: Citation[];
	seconds: number | null;
	docx_path?: string;
}

// ── reports ──────────────────────────────────────────────────────────────────

export type ReportSection =
	| { type: "heading"; text: string }
	| { type: "table"; table: AnswerTable }
	| { type: "target_table"; rows: Array<{ entity: string; target: number | null; actual: number | null; achievement_pct: number | null; cites: Array<number | null> }>; period: string }
	| { type: "chart"; kind: string; series: Record<string, Array<[string, number]>> }
	| { type: "narrative"; text: string; guard: GuardVerdict }
	| { type: "evidence"; passages: Array<{ n: number; snippet: string; filename: string; page_no: number | null }> };

export interface ReportPayload {
	template: string;
	title: string;
	params: Record<string, unknown>;
	sections: ReportSection[];
	citations: Citation[];
	docx_path?: string;
	guard: { ok: boolean; checked: number; unsupported: number };
	seconds: number;
}

// ── topics / library views ───────────────────────────────────────────────────

export interface TopicsPayload {
	status: string;
	topics: Array<{
		id: number;
		label: string;
		keywords: string[];
		count: number;
		by_year: Record<string, number>;
		by_subsidiary: Record<string, number>;
		by_kind: Record<string, number>;
		examples: Array<{ chunk_id: number; document_id: number; filename: string; page_no: number | null; snippet: string }>;
	}>;
	terms: Array<{ term: string; count: number }>;
	chunks: number;
	documents: number;
	built_at?: number;
	seconds?: number;
	message?: string;
}

export interface Lineage extends Omit<FactWithDoc, "checks"> {
	sources: Array<{ page_no: number | null; raw_text: string | null; raw_unit: string | null; conversion: string | null; bbox: number[] | null }>;
	unit_label: string;
	metric_label: string;
	entity_name: string;
	alternatives: Array<{ id: number; value: number; unit: string; is_provisional: number; status: string; filename: string; doc_kind: string; pq_house: string | null; pq_number: string | null; pq_date: string | null }>;
	checks: Array<{ check_name: string; result: string; detail: string }>;
}

export type MetricsPayload = Record<string, any>;

// ── the tool contract ───────────────────────────────────────────────────────

export type AskCard = AskPayload & { kind: "ask" };
export type PqCard = PqPayload & { kind: "pq" };
export type ReportCard = ReportPayload & { kind: "report" };
export type TopicsCard = TopicsPayload & { kind: "topics" };

export interface ComposePrompt { system: string; user: string }

export interface FinishedProse {
	text: string;
	guard: GuardVerdict;
	composedBy: string;
	result: ToolResult;
}

export interface ToolResult {
	ok: boolean;
	tool: ToolName;
	text: string;
	final: string | null;
	compose: { system: string; user: string } | null;
	templateAnswer: string;
	allowed: number[];
	card: AskCard | PqCard | ReportCard | TopicsCard;
	deliverable?: { name: string; mime: string; bytes: Uint8Array };
	/** PQ only: parts the model should write prose for (documents-only or "why" parts). `compose` is null for these. */
	composeParts?: Array<{ label: string; compose: ComposePrompt }>;
	/** Re-run with the model's prose (a string for ask; label → prose for a PQ). Same guard, same refusal handling. */
	resume?: (prose: string | Record<string, string>) => ToolResult;
}
