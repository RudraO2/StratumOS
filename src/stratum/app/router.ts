/**
 * The router: keyword rules classify the request, a capability score picks the model.
 * Ported from the product's `router/classify.js` and `router/score.js`. Deterministic on purpose: the
 * same words take the same route, and the chip can show which rules fired.
 *
 * One addition for this build: a `web` task type (open a website). The product has no such tool; the
 * demo has one so that the seal has something to refuse.
 */
import { FLEET, type FleetMember } from "./fleet";

export const TASK_TYPES = ["ask", "pq_reply", "report", "topics", "vision", "chat", "web"] as const;
export type TaskType = (typeof TASK_TYPES)[number];

const PRIORITY: TaskType[] = ["web", "pq_reply", "report", "topics", "ask", "vision", "chat"];

const RULES: Record<TaskType, Array<[string, RegExp]>> = {
	web: [
		["open-site", /\b(open|browse|visit|go\s+to|navigate\s+to|fetch|download|check)\b[\s\S]{0,60}(https?:|www\.|\.com\b|\.in\b|\.org\b|\bwebsite\b|\bweb\s*site\b|\binternet\b|\bonline\b|\bwhatsapp\b)/],
		["url", /https?:\/\/\S+/],
	],
	pq_reply: [
		["lok-sabha", /\blok\s+sabha\b/],
		["rajya-sabha", /\brajya\s+sabha\b/],
		["starred", /\b(un)?starred\s+question\b/],
		["pleased-to-state", /\bpleased\s+to\s+state\b/],
		["minister-of-coal", /\bminister\s+of\s+coal\b/],
		["parts-a-b", /\(a\)[\s\S]{0,400}\(b\)/],
		["pq-noun", /\b(parliament(ary)?\s+question|pq\s+reply|reply\s+to\s+(the\s+)?(pq|parliament))\b/],
	],
	report: [
		["generate-report", /\b(generate|prepare|create|make|draft|produce|build)\b[\s\S]{0,60}\b(report|briefing|brief|summary\s+note)\b/],
		["report-template", /\b(target\s+vs\.?\s+achievement|subsidiary-?wise\s+(annual\s+)?production\s+report|trend\s+report)\b/],
		["docx", /\b(docx|word\s+document)\b/],
	],
	topics: [
		["topics", /\b(topics?|themes?)\b/],
		["word-cloud", /\bword\s*-?cloud\b/],
		["trending", /\b(trending|most\s+discussed|frequently\s+asked|recurring\s+issues?)\b/],
	],
	ask: [
		["question-word", /\b(what|which|how\s+much|how\s+many|why|when|where|who|list|show|compare|give|tell)\b/],
		["question-mark", /\?\s*$/],
		["production", /\b(production|produced|output|dispatch|offtake|despatch|overburden|obr|capacity|target|achievement)\b/],
		["coal-entity", /\b(cil|coal\s+india|cmpdi|secl|mcl|ncl|ccl|bccl|ecl|wcl|nec|sccl|singareni|mine|coalfield|colliery|block)\b/],
		["geology", /\b(reserves?|resources?|seam|borehole|exploration|drilling|geolog\w*|grade|gcv|stripping\s+ratio)\b/],
		["period", /\b(fy\s?\d{2,4}|20\d{2}\s*-\s*\d{2,4}|\d{4}-\d{2}|financial\s+year|quarter|month)\b/],
		["hindi", /[ऀ-ॿ]{3,}/],
	],
	vision: [],
	chat: [
		["greeting", /^\s*(hi|hello|hey|namaste|good\s+(morning|afternoon|evening)|thanks?|thank\s+you)\b[\s!.]*$/],
		["about-you", /\b(who\s+are\s+you|what\s+can\s+you\s+do|help\s+me\s+get\s+started)\b/],
	],
};

export interface Classification {
	taskType: TaskType;
	scores: Record<string, number>;
	matchedRules: Record<string, string[]>;
	matchedRuleCount: number;
	fallback: boolean;
	tied: boolean;
	hasImage: boolean;
}

export function classifyRequest(text: string, options: { hasImage?: boolean } = {}): Classification {
	const haystack = text.toLowerCase();
	const hasImage = options.hasImage === true;
	const scores: Record<string, number> = {};
	const matchedRules: Record<string, string[]> = {};
	let matchedRuleCount = 0;
	for (const type of TASK_TYPES) {
		const hits = RULES[type].filter(([, test]) => test.test(haystack)).map(([name]) => name);
		scores[type] = hits.length;
		matchedRules[type] = hits;
		matchedRuleCount += hits.length;
	}
	const base = { scores, matchedRules, matchedRuleCount, hasImage };
	if (hasImage) return { taskType: "vision", ...base, fallback: false, tied: false };
	if (scores.web > 0) return { taskType: "web", ...base, fallback: false, tied: false };
	if (scores.chat > 0 && scores.pq_reply === 0 && scores.report === 0 && scores.ask <= 2) return { taskType: "chat", ...base, fallback: false, tied: false };
	const workflows: TaskType[] = ["pq_reply", "report", "topics"];
	const eligible = TASK_TYPES.filter((t) => t !== "vision" && t !== "chat" && t !== "web");
	if (eligible.reduce((n, t) => n + scores[t], 0) === 0) return { taskType: haystack.trim().length < 12 ? "chat" : "ask", ...base, fallback: true, tied: false };
	const leaders = PRIORITY.filter((t) => workflows.includes(t) && scores[t] > 0);
	if (leaders.length > 0) return { taskType: leaders[0], ...base, fallback: false, tied: leaders.length > 1 };
	return { taskType: "ask", ...base, fallback: false, tied: false };
}

const PROFILES: Record<TaskType, { requires: string | null; weights: Record<string, number> }> = {
	ask: { requires: null, weights: { "document-understanding": 2, "structured-output": 2, "general-reasoning": 1, multilingual: 1 } },
	pq_reply: { requires: null, weights: { "document-understanding": 2, "structured-output": 2, "instruction-following": 1, multilingual: 1 } },
	report: { requires: null, weights: { "structured-output": 2, "general-reasoning": 2, "instruction-following": 1 } },
	topics: { requires: null, weights: { "general-reasoning": 2, "structured-output": 1, multilingual: 1 } },
	vision: { requires: "image", weights: { "visual-grounding": 3, "document-understanding": 2 } },
	chat: { requires: null, weights: { "instruction-following": 2, "general-reasoning": 1, multilingual: 1 } },
	web: { requires: null, weights: { "tool-use": 3, "instruction-following": 1 } },
};

export interface RoutingDecision {
	taskType: string;
	scored: Array<{ name: string; score: number; matched: Array<{ capability: string; points: number }>; modalities: string[]; capabilities: string[] }>;
	excluded: Array<{ name: string; reason: { code: string; detail: string } }>;
	selected: string | null;
	tied: boolean;
	allZero: boolean;
}

export function scoreFleet(taskType: TaskType, fleet: FleetMember[] = FLEET): RoutingDecision {
	const profile = PROFILES[taskType];
	const scored: RoutingDecision["scored"] = [];
	const excluded: RoutingDecision["excluded"] = [];
	for (const member of fleet) {
		if (profile.requires && !member.modalities.includes(profile.requires)) {
			excluded.push({ name: member.name, reason: { code: "modality-missing", detail: `task type "${taskType}" needs a member that accepts ${profile.requires} input; "${member.name}" declares modalities [${member.modalities.join(", ")}]` } });
			continue;
		}
		const matched = member.capabilities
			.filter((c) => profile.weights[c] !== undefined)
			.map((capability) => ({ capability, points: profile.weights[capability] }))
			.sort((a, b) => b.points - a.points);
		scored.push({ name: member.name, score: matched.reduce((n, h) => n + h.points, 0), matched, modalities: member.modalities, capabilities: member.capabilities });
	}
	scored.sort((a, b) => b.score - a.score);
	const top = scored.length > 0 ? scored[0].score : null;
	return { taskType, scored, excluded, selected: scored[0]?.name ?? null, tied: scored.length > 1 && scored[1].score === top, allZero: scored.length > 0 && top === 0 };
}
