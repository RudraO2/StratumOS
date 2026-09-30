/**
 * QueryIntent → parameterised lookups → an answer table. No model writes SQL (and here, no SQL at all).
 * Each cell is the canonical fact for (metric, entity, period) with its id, so every number in the table
 * carries a citation back to its source cell. Port of ask/sql.py.
 */
import * as domain from "./domain.ts";
import { pyFixed, pyRound, pySigned } from "./domain.ts";
import { canonical } from "./store.ts";
import { TARGET_OF } from "./intent.ts";
import type { AnswerTable, Cell, FactWithDoc, QueryIntent, TableRowOut } from "./types.ts";

function cell(fact: FactWithDoc): Cell {
	return { fact_id: fact.id, value: fact.value, display: domain.formatValue(fact.value, fact.unit), status: fact.status, provisional: Boolean(fact.is_provisional), reviewed: Boolean(fact.reviewed) };
}

function row(code: string, cells: Array<Cell | null>, change: number | null, gap: number | null = null): TableRowOut {
	const e = domain.entity(code);
	return { entity_code: code, entity: e ? e.name : code, short: e && (e.type === "subsidiary" || e.type === "company") ? code : e ? e.name : code, cells, change_pct: change, gap };
}

export function run(intent: QueryIntent): AnswerTable {
	if (intent.achievement) return runAchievement(intent);
	const info = domain.metric(intent.metric) ?? { label: intent.metric ?? "", unit: "" };
	const rows: TableRowOut[] = [];
	const used: FactWithDoc[] = [];
	const derived: number[] = [];
	for (const code of intent.entities) {
		const cells: Array<Cell | null> = [];
		const values: Array<number | null> = [];
		for (const period of intent.periods) {
			const fact = canonical(intent.metric, code, period);
			if (!fact) {
				cells.push(null);
				values.push(null);
				continue;
			}
			used.push(fact);
			values.push(fact.value);
			cells.push(cell(fact));
		}
		let change: number | null = null;
		if (values.length >= 2 && values[0] && values[values.length - 1] !== null) {
			const first = values[0] as number;
			const last = values[values.length - 1] as number;
			change = pyRound(((last - first) / first) * 100, 2);
			derived.push(change, pyRound(last - first, 2));
		}
		if (cells.some(Boolean)) rows.push(row(code, cells, change));
	}
	// Sums the composer may legitimately state ("CIL subsidiaries together produced ...").
	const subs = new Set(domain.cilSubsidiaries());
	for (let index = 0; index < intent.periods.length; index++) {
		const column = rows.filter((r) => r.cells[index] && subs.has(r.entity_code)).map((r) => r.cells[index]!.value);
		if (column.length >= 2) derived.push(pyRound(column.reduce((a, b) => a + b, 0), 2));
	}
	const unit = used.length > 0 ? used[0].unit : info.unit;
	const missing = rows.reduce((n, r) => n + r.cells.filter((c) => c === null).length, 0) + (intent.entities.length - rows.length) * intent.periods.length;
	return {
		title: `${info.label} (${domain.unitLabel(unit)})`,
		kind: "values",
		metric: intent.metric,
		unit,
		unit_label: domain.unitLabel(unit),
		periods: intent.periods,
		rows,
		show_change: intent.periods.length >= 2,
		change_label: "Change %",
		facts: used,
		derived,
		missing,
	};
}

/** Target and actual side by side, with the achievement % and the gap computed here (not by a model). */
function runAchievement(intent: QueryIntent): AnswerTable {
	const targetKey = (intent.metric ? TARGET_OF[intent.metric] : undefined) ?? "production_target";
	const info = domain.metric(intent.metric) ?? { label: intent.metric ?? "", unit: "" };
	const rows: TableRowOut[] = [];
	const used: FactWithDoc[] = [];
	const derived: number[] = [];
	const columns = intent.periods.flatMap((period) => [`Target ${period}`, `Actual ${period}`]);
	for (const code of intent.entities) {
		const cells: Array<Cell | null> = [];
		let last: [number, number] | null = null;
		for (const period of intent.periods) {
			const target = canonical(targetKey, code, period);
			const actual = canonical(intent.metric, code, period);
			for (const fact of [target, actual]) {
				cells.push(fact ? cell(fact) : null);
				if (fact) used.push(fact);
			}
			if (target && actual && target.value) {
				last = [pyRound((actual.value / target.value) * 100, 2), pyRound(actual.value - target.value, 2)];
				derived.push(last[0], last[1], Math.abs(last[1]));
			}
		}
		if (cells.some(Boolean)) rows.push(row(code, cells, last ? last[0] : null, last ? last[1] : null));
	}
	const unit = used.length > 0 ? used[0].unit : info.unit;
	const missing = rows.reduce((n, r) => n + r.cells.filter((c) => c === null).length, 0) + (intent.entities.length - rows.length) * columns.length;
	return {
		title: `${info.label}: target vs actual (${domain.unitLabel(unit)})`,
		kind: "achievement",
		metric: intent.metric,
		unit,
		unit_label: domain.unitLabel(unit),
		periods: columns,
		rows,
		show_change: true,
		change_label: "Achievement %",
		facts: used,
		derived,
		missing,
	};
}

/** The table as the composer sees it: every value tagged with its citation number. */
export function toMarkdown(table: AnswerTable, citeFor: Record<number, number>): string {
	const header = ["Entity", ...table.periods, ...(table.show_change ? [table.change_label || "Change %"] : [])];
	const lines = [`| ${header.join(" | ")} |`, "|" + "---|".repeat(header.length)];
	const achievement = table.kind === "achievement";
	for (const r of table.rows) {
		const cells = r.cells.map((c) => (c === null ? "not available" : `${c.display}${c.provisional ? " (provisional)" : ""} [${citeFor[c.fact_id] ?? "?"}]`));
		const extra = table.show_change ? [r.change_pct === null ? "—" : achievement ? `${pyFixed(r.change_pct, 2)}%` : `${pySigned(r.change_pct, 2)}%`] : [];
		lines.push(`| ${[r.short, ...cells, ...extra].join(" | ")} |`);
	}
	return lines.join("\n");
}

export const publicTable = (t: AnswerTable | null): AnswerTable | null => {
	if (!t) return null;
	const { facts: _f, derived: _d, ...rest } = t;
	return rest as AnswerTable;
};
