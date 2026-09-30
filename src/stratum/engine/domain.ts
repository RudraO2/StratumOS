/**
 * The coal domain: canonical entities, metrics, financial-year periods, numbers.
 * A line-for-line port of backend/stratum/domain/__init__.py, deterministic and dependency-free.
 */
import library from "../data/library.json" with { type: "json" };

interface MasterEntity {
	code: string;
	type: string;
	name: string;
	parent?: string;
	aliases?: string[];
}
interface MasterMetric {
	key: string;
	unit: string;
	label: string;
	aliases?: string[];
	range?: [number, number];
}
interface Master {
	entities: MasterEntity[];
	metrics: MasterMetric[];
	source_precedence: Record<string, number>;
	stopwords_domain: Array<string | number>;
}

export const master = (library as unknown as { master: Master }).master;

// ── small Python-compat helpers ───────────────────────────────────────────────

export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Python `str.title()`: a letter is upper-cased when it does not follow another letter. */
export function pyTitle(s: string): string {
	return s.toLowerCase().replace(/(?<![\p{L}])\p{L}/gu, (m) => m.toUpperCase());
}

/** Python `f"{x:.{d}f}"`: round-half-even on the exact value (JS toFixed rounds exact ties up). */
export function pyFixed(x: number, d = 2): string {
	const scaled = x * 10 ** d;
	if (Number.isFinite(scaled) && Math.abs(scaled % 1) === 0.5) {
		const floor = Math.floor(scaled);
		const n = floor % 2 === 0 ? floor : floor + 1;
		return (n / 10 ** d).toFixed(d);
	}
	return x.toFixed(d);
}

/** Python `round(x, d)`. */
export const pyRound = (x: number, d = 2) => Number(pyFixed(x, d));

/** Python `f"{x:+.2f}"`. */
export function pySigned(x: number, d = 2): string {
	const s = pyFixed(Math.abs(x), d);
	return (x < 0 || Object.is(x, -0) ? "-" : "+") + s;
}

/** Python `f"{x:g}"`. */
export function fmtG(x: number): string {
	if (x === 0) return "0";
	const exp = Math.floor(Math.log10(Math.abs(x)));
	if (exp < -4 || exp >= 6) {
		const [m, e] = x.toExponential(5).split("e");
		const mant = m.includes(".") ? m.replace(/0+$/, "").replace(/\.$/, "") : m;
		const sign = e.startsWith("-") ? "-" : "+";
		return `${mant}e${sign}${e.replace(/^[+-]/, "").padStart(2, "0")}`;
	}
	const s = Number(x.toPrecision(6)).toString();
	return s;
}

export function norm(text: string | null | undefined): string {
	if (!text) return "";
	let t = String(text).toLowerCase().replace(/&/g, " and ").replace(/_/g, " ");
	// dotted acronyms: "S.E.C.L." -> "secl"
	t = t.replace(/\b(?:[a-z]\.){2,}/g, (m) => m.replace(/\./g, "") + " ");
	t = t.replace(/[‐-―]/g, "-");
	t = t.replace(/[^\p{L}\p{N}_%'\-/ऀ-ॿ]+/gu, " ");
	t = t.replace(/-/g, " ");
	return t.replace(/\s+/g, " ").trim();
}

// ── entities ──────────────────────────────────────────────────────────────────

export interface Entity {
	code: string;
	type: string;
	name: string;
	parent?: string;
}

const byCode = new Map<string, Entity>();
const aliasToCode = new Map<string, string>();
for (const item of master.entities) {
	const e: Entity = { code: item.code, type: item.type, name: item.name, parent: item.parent };
	byCode.set(e.code, e);
	for (const alias of [item.name, item.code, ...(item.aliases ?? [])]) aliasToCode.set(norm(alias), e.code);
}
// Longest alias first, so "south eastern coalfields" wins over "eastern coalfields".
const orderedAliases: Array<[string, string]> = [...aliasToCode.entries()].sort((a, b) => b[0].length - a[0].length);

export const entity = (code: string): Entity | undefined => byCode.get(code);

export function cilSubsidiaries(producingOnly = true): string[] {
	const codes = [...byCode.values()].filter((e) => e.type === "subsidiary").map((e) => e.code);
	return codes.filter((c) => !(producingOnly && c === "CMPDI"));
}

export const entitiesOfType = (kind: string) => [...byCode.values()].filter((e) => e.type === kind).map((e) => e.code);

const ENTITY_NOISE = /^(\d+[.)]?\s*|[ivx]+[.)]\s*|sl\s*no\s*)|\s*(\*+|#|\(p\)|\(provisional\)|ltd|limited)$/g;

export function resolveEntity(text: string | null | undefined): Entity | undefined {
	let key = norm(text);
	if (!key) return undefined;
	key = key.replace(ENTITY_NOISE, "").trim();
	key = key.replace(/\s*\b(ltd|limited)\b\s*$/, "").trim();
	const code = aliasToCode.get(key);
	if (code) return entity(code);
	for (const [alias, c] of orderedAliases) {
		// a short alias ("cil") must match a whole word, never a substring of another word
		if (alias.length <= 4) {
			if (new RegExp(`^(total\\s+)?${escapeRe(alias)}(\\s+total)?$`).test(key)) return entity(c);
		} else if (key.startsWith(alias) || key.endsWith(alias)) return entity(c);
	}
	return undefined;
}

const SKIP_ALIASES = new Set(["total", "india", "others", "t"]);
const aliasRegexCache = new Map<string, RegExp>();

/** Every entity mentioned in free text (a question), in order of appearance. */
export function findEntities(text: string): string[] {
	const haystack = ` ${norm(text)} `;
	const found: Array<[number, string]> = [];
	const taken: Array<[number, number]> = [];
	for (const [alias, code] of orderedAliases) {
		if (alias.length < 2 || SKIP_ALIASES.has(alias)) continue;
		let re = aliasRegexCache.get(alias);
		if (!re) {
			re = new RegExp(`(?<=\\s)${escapeRe(alias)}(?=\\s)`, "g");
			aliasRegexCache.set(alias, re);
		}
		for (const match of haystack.matchAll(re)) {
			const start = match.index ?? 0;
			const span: [number, number] = [start, start + match[0].length];
			if (taken.some(([a, b]) => !(span[1] <= a || span[0] >= b))) continue;
			taken.push(span);
			found.push([span[0], code]);
		}
	}
	const ordered: string[] = [];
	for (const [, code] of found.sort((a, b) => a[0] - b[0])) if (!ordered.includes(code)) ordered.push(code);
	if (/\ball[\s-]+india\b/.test(haystack) && !ordered.includes("ALL_INDIA")) ordered.push("ALL_INDIA");
	return ordered;
}

// ── metrics ───────────────────────────────────────────────────────────────────

const metricByKey = new Map(master.metrics.map((m) => [m.key, m]));
const metricAliases: Array<[string, string]> = [];
for (const m of master.metrics) for (const alias of [m.label, m.key.replace(/_/g, " "), ...(m.aliases ?? [])]) metricAliases.push([norm(alias), m.key]);
metricAliases.sort((a, b) => b[0].length - a[0].length);

export const metric = (key: string | null | undefined): MasterMetric | undefined => (key ? metricByKey.get(key) : undefined);
export const metricKeys = () => [...metricByKey.keys()];

export function resolveMetric(text: string | null | undefined): string | null {
	const key = norm(text);
	if (!key) return null;
	for (const [alias, k] of metricAliases) if (new RegExp(`(^|\\s)${escapeRe(alias)}(\\s|$)`).test(key)) return k;
	return null;
}

/** The metric a question is about. Targets and offtake are checked before plain production. */
export function findMetric(text: string): string | null {
	const key = norm(text);
	if (/\btarget/.test(key)) return /offtake|despatch|dispatch/.test(key) ? "offtake_target" : "production_target";
	if (/\b(offtake|off take|despatch|dispatch|supply|supplied)\b/.test(key)) return "coal_offtake";
	if (/\b(overburden|over burden|obr)\b/.test(key)) return "obr";
	return resolveMetric(text);
}

export const metricLabel = (key: string | null | undefined) => metric(key)?.label ?? key ?? "";

// ── periods ───────────────────────────────────────────────────────────────────

const FY_PATTERNS = [/\bfy\s*'?(\d{4})\s*[-/–]\s*(\d{2,4})\b/i, /\b(\d{4})\s*[-/–]\s*(\d{2,4})\b/, /\bfy\s*'?(\d{2})\s*[-/–]\s*(\d{2})\b/i, /\bfy\s*'?(\d{2,4})\b/i];
const MONTHS: Record<string, number> = Object.fromEntries(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].map((m, i) => [m, i + 1]));

export const fyLabel = (startYear: number) => `FY${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;

function fyFrom(a: string, b: string | null): string | null {
	if (b === null) {
		// "FY24" / "FY2024" means the year ending March 2024 → FY2023-24
		let year = parseInt(a, 10);
		year = year < 100 ? year + 2000 : year;
		return year > 1950 && year < 2100 ? fyLabel(year - 1) : null;
	}
	let start = parseInt(a, 10);
	start = start < 100 ? start + 2000 : start;
	let end = parseInt(b, 10);
	if (end < 100) end += Math.floor(start / 100) * 100;
	if (end < start) end += 100; // 1999-00
	if (end - start !== 1 || !(start > 1950 && start < 2100)) return null;
	return fyLabel(start);
}

/** A header like '2023-24', 'FY 2023-24 (Prov.)', 'FY24', 'Apr-Sep 2024-25' → [period, kind]. */
export function parsePeriod(text: string | null | undefined): [string, string] | null {
	if (!text) return null;
	const raw = String(text);
	const low = raw.toLowerCase();
	const partial = /\b(apr(?:il)?)\s*[-–to ]+\s*([a-z]{3,9})\b/.exec(low);
	for (const pattern of FY_PATTERNS) {
		const match = pattern.exec(raw);
		if (!match) continue;
		const groups = match.slice(1);
		const fy = fyFrom(groups[0], groups.length > 1 ? groups[1] : null);
		if (fy) {
			if (partial && partial[2].slice(0, 3) in MONTHS && partial[2].slice(0, 3) !== "mar") {
				const m = partial[2].slice(0, 3);
				return [`${fy}:Apr-${m[0].toUpperCase()}${m.slice(1)}`, "fy_partial"];
			}
			return [fy, "fy"];
		}
	}
	const month = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,'-]*(\d{4}|\d{2})\b/.exec(low);
	if (month) {
		let year = parseInt(month[2], 10);
		year = year < 100 ? year + 2000 : year;
		return [`${year}-${String(MONTHS[month[1]]).padStart(2, "0")}`, "month"];
	}
	const cal = /^\s*((19|20)\d{2})\s*$/.exec(raw);
	if (cal) return [cal[1], "calendar_year"];
	return null;
}

export function fyStart(period: string | null | undefined): number {
	const m = /^FY(\d{4})/.exec(period ?? "");
	return m ? parseInt(m[1], 10) : 0;
}

/** Every FY mentioned in a question, in order; 'between 2019-20 and 2023-24' expands to the range. */
export function findPeriods(text: string): string[] {
	let found: string[] = [];
	for (const match of text.matchAll(/\bfy\s*'?\d{2,4}(?:\s*[-/–]\s*\d{2,4})?|\b\d{4}\s*[-/–]\s*\d{2,4}\b/gi)) {
		const parsed = parsePeriod(match[0]);
		if (parsed && parsed[1] === "fy" && !found.includes(parsed[0])) found.push(parsed[0]);
	}
	if (found.length === 2 && /\b(between|from|to|till|until|through|–|-)\b/i.test(text) && /\b(between|from)\b/i.test(text)) {
		const [a, b] = [...found].sort((x, y) => fyStart(x) - fyStart(y));
		found = [];
		for (let y = fyStart(a); y <= fyStart(b); y++) found.push(fyLabel(y));
	}
	const lastN = /\b(?:last|past|previous)\s+(\d{1,2}|two|three|four|five|six|seven|eight|nine|ten)\s+(?:financial\s+)?years\b/i.exec(text);
	if (lastN && found.length === 0) {
		const words: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
		const n = words[lastN[1].toLowerCase()] ?? parseInt(lastN[1], 10);
		found = [`LAST:${n}`];
	}
	return found;
}

// ── numbers ───────────────────────────────────────────────────────────────────

const NA = new Set(["", "-", "–", "—", "na", "n a", "nil", "n/a", "..", "...", "neg", "negligible", "x"]);

/** '1,23,456.7', '(12.5)', '47.12*', '8.5%', '−3.2' → number; NA markers → null. */
export function parseNumber(text: string | number | null | undefined): number | null {
	if (text === null || text === undefined) return null;
	let raw = String(text).trim();
	if (NA.has(raw.toLowerCase())) return null;
	raw = raw.replace(/−/g, "-").replace(/–/g, "-");
	const negative = raw.startsWith("(") && raw.endsWith(")");
	let cleaned = raw.replace(/[*#@$†‡^]+|\(p\)|\(prov\.?\)|%/gi, "").replace(/^[() ]+|[() ]+$/g, "");
	cleaned = cleaned.replace(/,/g, "").replace(/ /g, "").replace(/[.,:;|_]+$/, "");
	if (!/^[+-]?\d+(\.\d+)?$/.test(cleaned)) return null;
	const value = parseFloat(cleaned);
	return negative ? -value : value;
}

const NUMBER_IN_TEXT = /(?<![\p{L}\p{N}_.])[+-]?\d{1,3}(?:,\d{2,3})+(?:\.\d+)?(?![\p{L}\p{N}_])|(?<![\p{L}\p{N}_.])[+-]?\d+(?:\.\d+)?(?![\p{L}\p{N}_])/gu;

/** Devanagari digits → ASCII, so a Hindi answer cannot slip figures past the guard. */
export const asciiDigits = (text: string) => (text ?? "").replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966));

export function numbersIn(text: string): number[] {
	const out: number[] = [];
	for (const m of asciiDigits(text).matchAll(NUMBER_IN_TEXT)) {
		const v = parseNumber(m[0]);
		if (v !== null) out.push(v);
	}
	return out;
}

export const precedence = (docKind: string | null | undefined) => master.source_precedence[docKind ?? "document"] ?? 50;

// ── display ───────────────────────────────────────────────────────────────────

function groupThousands(fixed: string): string {
	const neg = fixed.startsWith("-");
	const [int, frac] = (neg ? fixed.slice(1) : fixed).split(".");
	return (neg ? "-" : "") + int.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (frac !== undefined ? "." + frac : "");
}

export function formatValue(value: number, unit: string): string {
	if (unit === "percent") return `${pyFixed(value, 2)}%`;
	if (Math.abs(value) >= 1000) return groupThousands(pyFixed(value, 2));
	return pyFixed(value, 2);
}

const UNIT_LABELS: Record<string, string> = {
	million_tonnes: "MT",
	million_cubic_metres: "M.Cu.M",
	million_tonnes_per_annum: "MTPA",
	percent: "%",
	persons: "persons",
	tonnes_per_manshift: "t/manshift",
	metres: "m",
};

export const unitLabel = (unit: string) => UNIT_LABELS[unit] ?? unit.replace(/_/g, " ");

export const stopwords: string[] = master.stopwords_domain.map(String);
