/**
 * Question → QueryIntent (the semantic layer's input). A port of backend/stratum/ask/intent.py.
 *
 * Deterministic first: metric, entities and financial years are found by the same domain rules the fact extractor
 * uses. The Python backend asks its local model only when a question plainly wants a figure but names no metric the
 * rules recognise; here the browser-side model may pass that metric in as a hint (`metricHint`) under the same condition.
 */
import * as domain from "./domain.ts";
import { availablePeriods, entitiesWithMetric, stateEntitiesWithMetric } from "./store.ts";
import type { QueryIntent } from "./types.ts";

const EXPLAIN = /\b(why|reasons?|cause[sd]?|explain|factors?|due to|what led|how come|attributed)\b|कारण|क्यों/i;
const COMPARE = /\b(compare|comparison|vs\.?|versus|growth|increase|decrease|decline|declined|fall|fell|rise|rose|change|trend|over the years|year[- ]on[- ]year)\b|तुलना|वृद्धि/i;
const POLICY = /\b(steps?|measures?|initiatives?|policy|policies|schemes?|programmes?|status of|describe|what is|how is|how are|tell me about)\b/i;
const FIGURE_WANTED = /\b(how much|how many|quantity|figures?|numbers?|total|volume|amount)\b|कितना|कितने|कितनी/i;
const SUBSIDIARY_WISE = /\bsubsidiar(y|ies)[\s-]*wise\b|\beach subsidiar|\ball subsidiar|\bsubsidiaries\b|\bcompany[\s-]*wise\b/i;
const STATE_WISE = /\bstate[\s-]*wise\b|\beach state\b|\ball states\b|\bstates\b|राज्यवार/i;
const HINDI_METRICS: Array<[string, string]> = [
	["उत्पादन", "coal_production"],
	["प्रेषण", "coal_offtake"],
	["डिस्पैच", "coal_offtake"],
	["उठाव", "coal_offtake"],
	["ओवरबर्डन", "obr"],
	["लक्ष्य", "production_target"],
	// Romanised Hindi ("Hinglish") — how many officers actually type it
	["utpadan", "coal_production"],
	["utpaadan", "coal_production"],
	["pedawar", "coal_production"],
	["uthaav", "coal_offtake"],
	["uthav", "coal_offtake"],
	["preshan", "coal_offtake"],
	["lakshya", "production_target"],
];
const HINGLISH_WORDS = /\b(kitna|kitni|kitne|kya|kaise|kyon|kyun|batao|bataiye|bataye|mein|hai|hain|tha|thi|ka|ki|ke|tak|aur|wala|wali|sabhi)\b/gi;

/** 'hi' for Devanagari or for Romanised Hindi (at least two Hindi function words); answers follow the question's language. */
export function detectLanguage(question: string): "en" | "hi" {
	if (/[ऀ-ॿ]{3,}/.test(question)) return "hi";
	const words = new Set([...question.matchAll(HINGLISH_WORDS)].map((m) => m[0].toLowerCase()));
	return words.size >= 2 ? "hi" : "en";
}

export const TARGET_OF: Record<string, string> = { coal_production: "production_target", coal_offtake: "offtake_target" };
export const BASE_OF: Record<string, string> = Object.fromEntries(Object.entries(TARGET_OF).map(([k, v]) => [v, k]));

const ACHIEVEMENT = /\b(achiev\w*|fulfil\w*|attain\w*|surpass\w*|exceed\w*|short[\s-]?fall)\b|\btarget\b.*\b(met|reached)\b|\bmet\b.*\btarget\b|लक्ष्य.*(प्राप्त|हासिल)/i;

/** The metric whose availability bounds the answer: for target-vs-actual, the target. */
export const probeMetric = (intent: QueryIntent): string | null => (intent.achievement && intent.metric ? (TARGET_OF[intent.metric] ?? intent.metric) : intent.metric);

export function newIntent(partial: Partial<QueryIntent> = {}): QueryIntent {
	return { route: "rag", metric: null, entities: [], periods: [], scope: "specific", compare: false, explain: false, achievement: false, language: "en", source: "rules", notes: [], ...partial };
}

/** `context` (a PQ's subject line, the previous part) may only supply a missing entity or year — never the metric. */
export function parse(question: string, context = "", metricHint?: string | null): QueryIntent {
	const q = question.trim();
	const language = detectLanguage(q);
	let metric: string | null = domain.findMetric(q);
	if (metric === "growth_pct" || metric === "achievement_pct") metric = "coal_production";
	if (metric === null) {
		const low = q.toLowerCase();
		for (const [word, key] of HINDI_METRICS) {
			if (low.includes(word)) {
				metric = key;
				break;
			}
		}
	}
	if (metric && POLICY.test(q) && domain.findPeriods(q).length === 0 && domain.findEntities(q).length === 0 && !FIGURE_WANTED.test(q) && !ACHIEVEMENT.test(q)) {
		metric = null; // "What steps are taken to enhance production?" asks for the documents, not a figure
	}
	let achievement =
		ACHIEVEMENT.test(q) &&
		(metric === null || metric in TARGET_OF || metric in BASE_OF || domain.findMetric(q) === "achievement_pct") &&
		/target|लक्ष्य|lakshya/i.test(q);
	if (achievement) metric = (metric ? BASE_OF[metric] : undefined) ?? metric ?? "coal_production";
	let entities = domain.findEntities(q);
	let periods = domain.findPeriods(q);
	if (context) {
		if (entities.length === 0) entities = domain.findEntities(context);
		if (periods.length === 0) periods = domain.findPeriods(context);
	}
	const explain = EXPLAIN.test(q);
	const compare = COMPARE.test(q) || periods.length > 1;
	let scope: QueryIntent["scope"] = "specific";
	if (SUBSIDIARY_WISE.test(q)) scope = "subsidiaries";
	else if (STATE_WISE.test(q)) scope = "states";

	const intent = newIntent({ route: "rag", metric, entities, periods, scope, compare: compare && !achievement, explain, achievement, language });

	if (metric === null && FIGURE_WANTED.test(q) && metricHint && domain.metric(metricHint) && !["growth_pct", "achievement_pct"].includes(metricHint)) {
		intent.metric = metricHint;
		intent.source = "rules+llm";
	}

	if (intent.metric) {
		const unknown = entities.length > 0 || scope !== "specific" ? null : unknownEntity(q);
		if (unknown) {
			// Never answer "Mars Colony" with All-India figures: search the documents only.
			intent.notes.push(`“${unknown}” is not in the master data — searching documents only`);
			return intent;
		}
		intent.route = intent.explain ? "sql_rag" : "sql";
		resolveScopeAndPeriods(intent);
	}
	return intent;
}

const PROPER = /\b(?:of|for|at|by|in|from)\s+((?:[A-Z][\w&'.-]*\s*){1,4})/g;
const NOT_ENTITIES = new Set([
	"India", "Indian", "Coal", "Ltd", "Limited", "Parliament", "Lok", "Sabha", "Rajya", "Ministry", "Government", "FY",
	"January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
	"Hindi", "English", "Table", "Annexure", "Chapter", "Million", "Tonnes", "MT",
]);

/** A capitalised name after 'of/for/in…' that the master data does not know ("Mars Colony"). */
export function unknownEntity(question: string): string | null {
	for (const match of question.matchAll(PROPER)) {
		const name = match[1].trim().replace(/\.+$/, "");
		const words = name.split(/\s+/).filter((w) => w && !NOT_ENTITIES.has(w) && !/^(?:FY[\d\-/]*|[A-Z]{1,2}\d*|\d[\d\-/]*)$/.test(w));
		if (words.length > 0 && !domain.resolveEntity(name) && !domain.findMetric(name)) return words.join(" ");
	}
	return null;
}

function resolveScopeAndPeriods(intent: QueryIntent): void {
	if (intent.scope === "subsidiaries") {
		const extra = intent.entities.filter((code) => domain.entity(code) && domain.entity(code)!.type !== "subsidiary");
		intent.entities = [...domain.cilSubsidiaries(), "CIL", ...extra.filter((e) => e !== "CIL")];
	} else if (intent.scope === "states") {
		intent.entities = stateEntitiesWithMetric(intent.metric);
	}
	const probe = probeMetric(intent);
	if (intent.entities.length === 0) {
		const present = new Set(entitiesWithMetric(probe));
		const picked = ["ALL_INDIA", "CIL"].filter((c) => present.has(c));
		intent.entities = picked.length > 0 ? picked : ["CIL"];
		intent.notes.push("no entity named — showing All India / CIL");
	}

	const available = availablePeriods(probe);
	if (intent.periods.length > 0 && intent.periods[0].startsWith("LAST:")) {
		const n = parseInt(intent.periods[0].split(":")[1], 10);
		intent.periods = n === 0 ? [...available] : available.slice(-n);
	} else if (intent.periods.length === 0) {
		if (available.length > 0) {
			intent.periods = intent.compare ? available.slice(-2) : available.slice(-1);
			intent.notes.push(`no year named — using latest available (${intent.periods.join(", ")})`);
		}
	}
	if (intent.periods.length === 1 && intent.compare && available.length > 0) {
		const index = available.indexOf(intent.periods[0]);
		if (index > 0) intent.periods = [available[index - 1], intent.periods[0]];
	}
}
