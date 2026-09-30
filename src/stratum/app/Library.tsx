import { useMemo, useState, type ReactNode } from "react";
import type { AppProps } from "../../os/kernel/apps";
import { library } from "../engine";
import { openDocument, TopicsView } from "./components/Cards";
import { StateDot, type DotState } from "./components/ui";

type Tab = "documents" | "facts" | "topics" | "metrics";
const TABS: Array<[Tab, string]> = [
	["documents", "Documents"],
	["facts", "Facts"],
	["topics", "Topics"],
	["metrics", "Metrics"],
];

const KIND_LABEL: Record<string, string> = {
	annual_report: "Annual report",
	provisional_stats: "Provisional statistics",
	press_release: "Press release",
	coal_directory: "Coal directory (scanned)",
	spreadsheet: "Spreadsheet",
	pq_reply: "Parliament reply",
	document: "Document",
};
const STATUS_DOT: Record<string, DotState> = { verified: "done", consistent: "done", flagged: "warning", rejected: "error" };

const TH = { textAlign: "left" as const, padding: "7px 12px", fontWeight: 600, color: "var(--label-secondary)", whiteSpace: "nowrap" as const, position: "sticky" as const, top: 0, background: "var(--bg-layer-2)" };
const TD = { padding: "7px 12px", whiteSpace: "nowrap" as const };

export function Library(_: AppProps) {
	const [tab, setTab] = useState<Tab>("documents");
	const summary = library.summary();
	return (
		<div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: "var(--bg-layer-1)", fontSize: 13 }}>
			<header style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 16px 0", borderBottom: "1px solid var(--border-l1)" }}>
				<nav role="tablist" style={{ display: "flex", gap: 2 }}>
					{TABS.map(([id, label]) => (
						<button
							key={id}
							role="tab"
							aria-selected={tab === id}
							onClick={() => setTab(id)}
							style={{ padding: "8px 14px", fontWeight: tab === id ? 600 : 400, color: tab === id ? "var(--label-primary)" : "var(--label-secondary)", borderBottom: `2px solid ${tab === id ? "var(--accent)" : "transparent"}`, marginBottom: -1 }}
						>
							{label}
						</button>
					))}
				</nav>
				<span style={{ flex: 1 }} />
				<span style={{ color: "var(--label-tertiary)", fontSize: 12, paddingBottom: 8 }}>
					{library.documents().length} documents · {summary.total} facts · sample library
				</span>
			</header>
			<div className="scroll" style={{ flex: 1, overflow: "auto", padding: 16 }}>
				{tab === "documents" && <Documents />}
				{tab === "facts" && <Facts />}
				{tab === "topics" && <TopicsView card={{ kind: "topics", ...library.topics() }} status="done" />}
				{tab === "metrics" && <Metrics />}
			</div>
		</div>
	);
}

function Documents() {
	const docs = library.documents();
	const counts = useMemo(() => {
		const c: Record<number, number> = {};
		for (const f of library.facts()) c[f.document_id] = (c[f.document_id] ?? 0) + 1;
		return c;
	}, []);
	return (
		<div style={{ border: "1px solid var(--border-l1)", borderRadius: 8, overflow: "hidden" }}>
			<table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
				<thead>
					<tr>
						{["Document", "Kind", "Year", "Pages", "Facts", "Status"].map((h) => (
							<th key={h} style={TH}>{h}</th>
						))}
					</tr>
				</thead>
				<tbody>
					{docs.map((d) => (
						<tr key={d.id} style={{ borderTop: "1px solid var(--border-l1)" }}>
							<td style={{ ...TD, whiteSpace: "normal" }}>
								<button onClick={() => openDocument(d.id, d.filename)} title="Open the document in the viewer" style={{ textAlign: "left", textDecoration: "underline", textDecorationColor: "var(--border-l3)", overflowWrap: "anywhere" }}>
									{d.filename}
								</button>
								{d.pq_number && <div style={{ color: "var(--label-secondary)", fontSize: 11.5 }}>{[d.pq_house, d.pq_number, d.pq_date].filter(Boolean).join(" · ")}</div>}
							</td>
							<td style={TD}>{KIND_LABEL[d.doc_kind] ?? d.doc_kind}</td>
							<td className="tabular" style={TD}>{d.year ?? "—"}</td>
							<td className="tabular" style={TD}>{d.pages}</td>
							<td className="tabular" style={TD}>{counts[d.id] ?? 0}</td>
							<td style={TD}>
								<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
									<StateDot state="done" size={7} />
									ready{d.is_provisional ? " · provisional" : ""}
								</span>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function Facts() {
	const [status, setStatus] = useState<string>("");
	const [metric, setMetric] = useState<string>("");
	const [selected, setSelected] = useState<number | null>(null);
	const all = library.facts();
	const metrics = useMemo(() => [...new Set(all.map((f) => f.metric))].sort(), [all]);
	const rows = useMemo(() => library.facts({ status: status || undefined, metric: metric || undefined }), [status, metric]);
	const summary = library.summary();
	const chip = (value: string, label: string, n?: number) => (
		<button
			key={value}
			onClick={() => setStatus(value)}
			aria-pressed={status === value}
			style={{ padding: "4px 10px", borderRadius: 999, border: "1px solid var(--border-l2)", background: status === value ? "var(--selector)" : "var(--bg-layer-2)", fontSize: 12 }}
		>
			{label}
			{n != null && <span style={{ color: "var(--label-tertiary)", marginLeft: 5 }}>{n}</span>}
		</button>
	);
	return (
		<div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
			<div style={{ flex: 1, minWidth: 0 }}>
				<div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
					{chip("", "All", summary.total)}
					{chip("verified", "Verified", (summary as Record<string, number>).verified)}
					{chip("consistent", "Consistent", (summary as Record<string, number>).consistent)}
					{chip("flagged", "Flagged", (summary as Record<string, number>).flagged)}
					<select value={metric} onChange={(e) => setMetric(e.target.value)} aria-label="Metric" style={{ marginLeft: "auto", padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border-l2)", background: "var(--bg-layer-1)", fontSize: 12 }}>
						<option value="">All metrics</option>
						{metrics.map((m) => (
							<option key={m} value={m}>{m.replace(/_/g, " ")}</option>
						))}
					</select>
				</div>
				<div style={{ border: "1px solid var(--border-l1)", borderRadius: 8, overflow: "hidden" }}>
					<table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
						<thead>
							<tr>
								{["Entity", "Metric", "Period", "Value", "Status", "Source"].map((h) => (
									<th key={h} style={{ ...TH, textAlign: h === "Value" ? "right" : "left" }}>{h}</th>
								))}
							</tr>
						</thead>
						<tbody>
							{rows.map((f) => (
								<FactLine key={f.id} fact={f} active={selected === f.id} onClick={() => setSelected(f.id === selected ? null : f.id)} />
							))}
						</tbody>
					</table>
				</div>
			</div>
			{selected !== null && <Lineage id={selected} onClose={() => setSelected(null)} />}
		</div>
	);
}

function FactLine({ fact, active, onClick }: { fact: ReturnType<typeof library.facts>[number]; active: boolean; onClick: () => void }) {
	return (
		<tr onClick={onClick} style={{ borderTop: "1px solid var(--border-l1)", cursor: "pointer", background: active ? "var(--selector)" : undefined }}>
			<td style={{ ...TD, fontWeight: 500 }}>{fact.entity_code.replace("STATE:", "")}</td>
			<td style={TD}>{fact.metric.replace(/_/g, " ")}</td>
			<td className="tabular" style={TD}>{fact.period}</td>
			<td className="tabular" style={{ ...TD, textAlign: "right" }}>
				{fact.value}
				{fact.is_provisional ? <span style={{ color: "var(--warn-label)", marginLeft: 4, fontSize: 10.5 }}>P</span> : null}
			</td>
			<td style={TD}>
				<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
					<StateDot state={STATUS_DOT[fact.status] ?? "done"} size={7} />
					{fact.status}
				</span>
			</td>
			<td style={{ ...TD, color: "var(--label-secondary)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>
				{library.documents().find((d) => d.id === fact.document_id)?.filename.replace(/^sample-/, "")}
				{fact.page_no ? ` · p.${fact.page_no}` : ""}
			</td>
		</tr>
	);
}

function Lineage({ id, onClose }: { id: number; onClose: () => void }) {
	const l = library.lineage(id);
	if (!l) return null;
	const doc = library.documents().find((d) => d.id === l.document_id);
	const row = (label: string, value: ReactNode) => (
		<div style={{ display: "flex", gap: 10, padding: "5px 0", borderBottom: "1px solid var(--border-l1)", fontSize: 12.5 }}>
			<span style={{ width: 92, flex: "0 0 auto", color: "var(--label-tertiary)" }}>{label}</span>
			<span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{value}</span>
		</div>
	);
	return (
		<aside className="fade-in" style={{ width: 300, flex: "0 0 auto", border: "1px solid var(--border-l2)", borderRadius: 10, padding: "12px 14px", position: "sticky", top: 0, background: "var(--bg-layer-1)" }}>
			<div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
				<span style={{ fontWeight: 600, flex: 1 }}>Where this figure came from</span>
				<button onClick={onClose} aria-label="Close" style={{ color: "var(--label-secondary)" }}>Close</button>
			</div>
			{row("Fact", `${l.entity_name} · ${l.metric_label} · ${l.period}`)}
			{row("Value", `${l.value} ${l.unit_label}`)}
			{row("Status", l.status)}
			{row("Document", doc ? <button onClick={() => openDocument(doc.id, doc.filename, l.page_no, { factId: l.id })} style={{ textDecoration: "underline", textAlign: "left" }}>{doc.filename}</button> : "—")}
			{row("Page", l.page_no ?? "—")}
			{row("Cell text", l.raw_text ? <span className="mono">{l.raw_text}</span> : "—")}
			{l.conversion && row("Conversion", l.conversion)}
			<div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--label-tertiary)", margin: "12px 0 4px" }}>Checks</div>
			{l.checks.map(({ check_name: name, result, detail }, i) => (
				<div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start", fontSize: 12, padding: "3px 0" }}>
					<StateDot state={result === "pass" ? "done" : result === "fail" ? "error" : "warning"} size={7} style={{ marginTop: 5 }} />
					<span>
						<span style={{ fontWeight: 500 }}>{name.replace(/_/g, " ")}</span>
						<span style={{ color: "var(--label-secondary)" }}> — {detail}</span>
					</span>
				</div>
			))}
			{l.alternatives.length > 0 && (
				<div style={{ marginTop: 10, fontSize: 12, padding: "7px 9px", borderRadius: 8, background: "var(--warn-tertiary)", color: "var(--warn-label)" }}>
					Other sources give {l.alternatives.map((a) => `${a.value} (${a.filename.replace(/^sample-/, "")})`).join("; ")}.
				</div>
			)}
		</aside>
	);
}

// ── metrics ─────────────────────────────────────────────────────────────────

function Stat({ value, label, note }: { value: string; label: string; note?: string }) {
	return (
		<div style={{ border: "1px solid var(--border-l1)", borderRadius: 10, padding: "12px 14px", background: "var(--bg-layer-2)" }}>
			<div className="tabular" style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1 }}>{value}</div>
			<div style={{ fontSize: 12, marginTop: 6 }}>{label}</div>
			{note && <div style={{ fontSize: 11, color: "var(--label-tertiary)", marginTop: 3, lineHeight: 1.4 }}>{note}</div>}
		</div>
	);
}

function Metrics() {
	const m = library.metrics();
	const pct = (n: number | null | undefined) => (n == null ? "—" : `${Number(n).toFixed(1).replace(/\.0$/, "")}%`);
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 900 }}>
			<div style={{ fontSize: 12.5, color: "var(--label-secondary)", lineHeight: 1.5 }}>
				Measured by the running backend on this sample library against a gold set written independently of the extractor ({m.extraction.gold} facts, {m.routing.questions} questions). The numbers are the product's own run, not recomputed in this browser.
			</div>
			<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10 }}>
				<Stat value={pct(m.extraction.exact_match_pct)} label="Extraction exact match" note={`${m.extraction.matched} of ${m.extraction.gold} gold facts`} />
				<Stat value={pct(m.extraction.wrong_caught_pct)} label="Wrong values caught by a check" note={`${m.extraction.wrong_caught} of ${m.extraction.wrong} wrong values`} />
				<Stat value={pct(m.routing.accuracy_pct)} label="Question routing" note={`${m.routing.questions} gold questions`} />
				<Stat value={pct(m.numeric_answers.correct_pct)} label="Numeric answers correct" note={`${m.numeric_answers.questions} numeric questions`} />
				<Stat value={pct(m.lineage.citation_correct_pct)} label="Citations that land on the cell" note={`${m.lineage.facts} facts`} />
				<Stat value={pct(m.guard.unsupported_rate_pct)} label="Unsupported numbers" note={`${m.guard.unsupported} of ${m.guard.numbers_checked} figures checked`} />
				<Stat value={pct(m.automation.automation_pct)} label="Steps automated" note={`${m.automation.automated_steps} automated, ${m.automation.manual_steps} manual`} />
				<Stat value={m.time.avg_pq_draft_seconds ? `${m.time.avg_pq_draft_seconds}s` : "—"} label="Average PQ draft time" note="on a GTX 1650, local model" />
			</div>
			<div style={{ fontSize: 12, padding: "9px 12px", borderRadius: 8, background: "var(--bg-layer-2)", border: "1px solid var(--border-l1)", color: "var(--label-secondary)", lineHeight: 1.5 }}>
				<strong style={{ color: "var(--label-primary)" }}>Time reduction is not measured.</strong> It needs a timed person doing the same work by hand and with Stratum; {m.time.trials} trials have been run so far.
			</div>
		</div>
	);
}
