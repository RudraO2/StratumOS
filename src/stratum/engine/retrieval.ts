/**
 * Retrieval over the library's passages. The Python backend fuses FTS5 BM25 with dense vectors (RRF); a browser has
 * no embedding model, so this is the lexical half alone: BM25 with the same query-term logic (search/hybrid.py),
 * plus a relevance gate that stands in for the vector-similarity check.
 */
import { doc, chunks } from "./store.ts";
import type { ChunkRow, SearchHit } from "./types.ts";

const TOKEN = /[\p{L}\p{N}_ऀ-ॿ]+/gu;
const STOP = new Set(["what", "which", "the", "was", "were", "is", "are", "of", "in", "for", "and", "to", "a", "an", "how", "why", "did", "does", "do", "give", "show", "tell", "me", "about", "during", "by", "with", "on", "from", "between", "list"]);
/** Words every passage of a coal library contains; a hit on these alone is not evidence of relevance. */
const GENERIC = new Set(["coal", "india", "production", "ministry", "government", "limited", "ltd", "year", "years", "state", "total", "minister", "sabha", "lok", "rajya", "question", "unstarred", "starred", "answered", "details", "steps", "taken", "status", "measures", "initiatives", "whether", "during", "last", "three", "data", "figures", "tonnes", "million"]);

const tokenize = (text: string) => (text.toLowerCase().match(TOKEN) ?? []).filter((t) => t.length > 1);

/** hybrid._fts_query: content terms, stop-words removed, first 16. */
export function queryTerms(text: string): string[] {
	return tokenize(text)
		.filter((t) => !STOP.has(t))
		.slice(0, 16);
}

interface Indexed {
	chunk: ChunkRow;
	tf: Map<string, number>;
	len: number;
}

const indexed: Indexed[] = chunks.map((chunk) => {
	const tokens = tokenize(`${chunk.text} ${chunk.heading_path ?? ""}`);
	const tf = new Map<string, number>();
	for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
	return { chunk, tf, len: tokens.length };
});
const avgLen = indexed.reduce((s, i) => s + i.len, 0) / Math.max(1, indexed.length);
const df = new Map<string, number>();
for (const i of indexed) for (const t of i.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);

const K1 = 1.2;
const B = 0.75;

function bm25(terms: string[], item: Indexed): number {
	let score = 0;
	const N = indexed.length;
	for (const t of new Set(terms)) {
		const f = item.tf.get(t);
		if (!f) continue;
		const n = df.get(t) ?? 0;
		const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
		score += (idf * f * (K1 + 1)) / (f + K1 * (1 - B + (B * item.len) / avgLen));
	}
	return score;
}

export interface SearchOptions {
	k?: number;
	docKinds?: string[];
	excludeKinds?: string[];
}

export function search(query: string, { k = 8, docKinds, excludeKinds }: SearchOptions = {}): SearchHit[] {
	const terms = [...new Set(queryTerms(query))];
	if (terms.length === 0) return [];
	const ranked = indexed
		.map((i) => ({ i, score: bm25(terms, i) }))
		.filter((r) => r.score > 0)
		.filter((r) => !docKinds || docKinds.includes(doc(r.i.chunk.document_id)?.doc_kind ?? ""))
		.sort((a, b) => b.score - a.score);
	const hits: SearchHit[] = [];
	let rank = 0;
	for (const r of ranked.slice(0, k * 3)) {
		rank += 1;
		const c = r.i.chunk;
		if (excludeKinds?.includes(c.kind)) continue;
		const d = doc(c.document_id)!;
		const matched = terms.filter((t) => r.i.tf.has(t));
		hits.push({
			...c,
			filename: d.filename,
			title: d.title,
			doc_kind: d.doc_kind,
			year: d.year,
			pq_house: d.pq_house,
			pq_number: d.pq_number,
			pq_date: d.pq_date,
			pq_subject: d.pq_subject,
			bbox: null,
			score: Math.round(r.score * 1e5) / 1e5,
			// Kept for shape parity with the Python hit: here, the share of the question's content terms the passage contains.
			vector_sim: Math.round((matched.length / terms.length) * 1e4) / 1e4,
			lexical_rank: rank,
			matched,
			nTerms: terms.length,
		} as SearchHit);
		if (hits.length >= k) break;
	}
	return hits;
}

/**
 * Enough evidence to answer from? The Python gate is "vector similarity >= 0.80, or any keyword hit". Without vectors a
 * bare keyword hit is too generous ("capital of France" shares nothing, but "coal" shares everything), so the top
 * passage must contain at least a third of the question's content terms, and at least one of them must be specific.
 */
export function isRelevant(hits: SearchHit[]): boolean {
	if (hits.length === 0) return false;
	const top = hits[0] as SearchHit & { matched?: string[]; nTerms?: number };
	const matched = top.matched ?? [];
	const specific = matched.filter((t) => !GENERIC.has(t) && !/^\d+$/.test(t));
	return specific.length >= 1 && matched.length / Math.max(1, top.nTerms ?? 1) >= 0.3;
}
