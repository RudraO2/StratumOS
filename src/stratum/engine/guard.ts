/**
 * The number guard: generated text may only state numbers the evidence contains. Port of ask/guard.py.
 *
 * Years, financial years and citation markers are not claims and are skipped; counts under ten ("three subsidiaries",
 * "(a)") are not figures. Anything left over is an unsupported number.
 */
import { asciiDigits, numbersIn } from "./domain.ts";
import type { GuardVerdict } from "./types.ts";

const SKIP = /\[\d+\]|\b(?:fy\s*)?(?:19|20)\d{2}\s*[-–/]\s*\d{2,4}\b|\bfy\s*\d{2,4}\b|\b(?:19|20)\d{2}\b|^\s*\d+[.)]\s/gim;

const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.011, 0.006 * Math.abs(b));

export function check(text: string, allowed: Array<number | null | undefined>): GuardVerdict {
	const cleaned = asciiDigits(text).replace(SKIP, " ");
	const found = numbersIn(cleaned);
	const pool = allowed.filter((v): v is number => v !== null && v !== undefined).map((v) => Math.abs(v));
	const unsupported: number[] = [];
	for (const value of found) {
		if (Math.abs(value) < 10 && Number.isInteger(value)) continue;
		if (pool.some((candidate) => close(Math.abs(value), candidate))) continue;
		unsupported.push(value);
	}
	return { ok: unsupported.length === 0, checked: found.length, unsupported };
}
