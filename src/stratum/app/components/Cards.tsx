import { useState, type CSSProperties, type ReactNode } from "react";
import { downloadNode } from "../../../os/apps/Explorer";
import { launch } from "../../../os/kernel/launch";
import { useOS } from "../../../os/kernel/store";
import { library, type AnswerTable, type AskCard, type Citation, type PqCard, type ReportCard, type TopicsCard, type ToolResult } from "../../engine";
import { StateDot, type DotState } from "./ui";

const LABEL: CSSProperties = { color: "var(--label-tertiary)", fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" };

const ROUTE_LABEL: Record<string, string> = { sql: "Verified facts", rag: "Documents", sql_rag: "Facts and documents" };
const STATUS_DOT: Record<string, DotState> = { verified: "done", consistent: "done", flagged: "warning", rejected: "error" };

/** Open a library document (at a page when the PDF has one) in the workstation's browser. */
export function openDocument(documentId: number | undefined, filename: string, page?: number | null) {
	const doc = library.documents().find((d) => d.id === documentId) ?? library.documents().find((d) => d.filename === filename);
	if (!doc) return;
	launch("browser", { url: `/library/${doc.filename}${page && doc.filename.endsWith(".pdf") ? `#page=${page}` : ""}` }, doc.filename);
}

export function CardShell({ title, tag, status, children }: { title: string; tag?: string; status?: "running" | "done" | "error"; children: ReactNode }) {
	return (
		<section className="fade-up" style={{ border: "1px solid var(--border-l2)", borderRadius: 12, background: "var(--bg-layer-1)", overflow: "hidden" }}>
			<header style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderBottom: "1px solid var(--border-l1)", background: "var(--bg-layer-2)", fontSize: 12.5 }}>
				{status === "running" ? <Spinner /> : <StateDot state={status === "error" ? "warning" : "done"} size={8} />}
				<span style={{ fontWeight: 600 }}>{title}</span>
				{tag && <span style={{ color: "var(--label-secondary)" }}>· {tag}</span>}
			</header>
			<div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
		</section>
	);
}

export function Spinner() {
	return <span aria-hidden style={{ width: 10, height: 10, borderRadius: "50%", border: "2px solid var(--border-l3)", borderTopColor: "var(--label-primary)", display: "inline-block", animation: "spin 900ms linear infinite" }} />;
}

function Tag({ children, tone }: { children: ReactNode; tone?: "warn" | "ok" }) {
	return (
		<span style={{ display: "inline-flex", alignItems: "center", height: 18, padding: "0 7px", borderRadius: 999, fontSize: 10.5, fontWeight: 600, background: tone === "warn" ? "var(--warn-tertiary)" : "var(--bg-layer-3)", color: tone === "warn" ? "var(--warn-label)" : "var(--label-secondary)" }}>{children}</span>
	);
}

export function AnswerTableView({ table }: { table: AnswerTable }) {
	const head = ["", ...table.periods, ...(table.show_change ? [table.change_label] : [])];
	return (
		<div>
			<div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{table.title}</div>
			<div className="scroll" style={{ overflowX: "auto", border: "1px solid var(--border-l1)", borderRadius: 8 }}>
				<table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
					<thead>
						<tr style={{ background: "var(--bg-layer-2)" }}>
							{head.map((h, i) => (
								<th key={i} style={{ textAlign: i === 0 ? "left" : "right", padding: "6px 10px", fontWeight: 600, color: "var(--label-secondary)", whiteSpace: "nowrap" }}>
									{h}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{table.rows.map((row) => (
							<tr key={row.entity_code} style={{ borderTop: "1px solid var(--border-l1)" }}>
								<td style={{ padding: "6px 10px", fontWeight: 500, whiteSpace: "nowrap" }} title={row.entity}>
									{row.short}
								</td>
								{row.cells.map((cell, i) => (
									<td key={i} className="tabular" style={{ padding: "6px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
										{cell ? (
											<span title={`${cell.status}${cell.provisional ? " · provisional" : ""}`} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
												<StateDot state={STATUS_DOT[cell.status] ?? "done"} size={6} />
												{cell.display}
												{cell.provisional && <span style={{ color: "var(--warn-label)", fontSize: 10.5 }}>P</span>}
											</span>
										) : (
											<span style={{ color: "var(--label-tertiary)" }}>n/a</span>
										)}
									</td>
								))}
								{table.show_change && (
									<td className="tabular" style={{ padding: "6px 10px", textAlign: "right", color: row.change_pct == null ? "var(--label-tertiary)" : undefined }}>
										{row.change_pct == null ? "—" : table.kind === "achievement" ? `${row.change_pct.toFixed(2)}%` : `${row.change_pct > 0 ? "+" : ""}${row.change_pct.toFixed(2)}%`}
									</td>
								)}
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<div style={{ fontSize: 11, color: "var(--label-tertiary)", marginTop: 5 }}>Every figure is a fact read from a cited cell. P = provisional.</div>
		</div>
	);
}

export function Citations({ citations }: { citations: Citation[] }) {
	const [open, setOpen] = useState(false);
	if (citations.length === 0) return null;
	return (
		<div>
			<button onClick={() => setOpen((v) => !v)} aria-expanded={open} style={{ ...LABEL, display: "inline-flex", alignItems: "center", gap: 6 }}>
				<span aria-hidden style={{ fontSize: 9, display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform 120ms ease" }}>{"▸"}</span>
				Sources ({citations.length})
			</button>
			{open && (
				<ol style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
					{citations.map((c) => (
						<li key={c.n} style={{ display: "flex", gap: 8, fontSize: 12, lineHeight: 1.45 }}>
							<span className="tabular" style={{ color: "var(--accent)", fontWeight: 600, minWidth: 22 }}>[{c.n}]</span>
							<span style={{ minWidth: 0 }}>
								<button onClick={() => openDocument(c.document_id, c.filename, c.page_no)} title="Open the document at this page" style={{ color: "var(--label-primary)", textDecoration: "underline", textDecorationColor: "var(--border-l3)", textAlign: "left", overflowWrap: "anywhere" }}>
									{c.filename}
									{c.page_no ? ` · p.${c.page_no}` : ""}
								</button>
								<span style={{ display: "block", color: "var(--label-secondary)", overflowWrap: "anywhere" }}>{c.snippet.length > 200 ? `${c.snippet.slice(0, 200)}…` : c.snippet}</span>
							</span>
						</li>
					))}
				</ol>
			)}
		</div>
	);
}

function GuardLine({ checked, unsupported, extra }: { checked: number; unsupported: number; extra?: string }) {
	const bad = unsupported > 0;
	return (
		<div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: bad ? "var(--warn-label)" : "var(--label-secondary)" }}>
			<StateDot state={bad ? "warning" : "done"} size={7} />
			Number guard: {checked} figure{checked === 1 ? "" : "s"} checked, {unsupported} not found in the evidence.{extra ? ` ${extra}` : ""}
		</div>
	);
}

function Callout({ children, tone = "warn" }: { children: ReactNode; tone?: "warn" | "info" }) {
	return (
		<div style={{ fontSize: 12.5, lineHeight: 1.5, padding: "8px 10px", borderRadius: 8, background: tone === "warn" ? "var(--warn-tertiary)" : "var(--bg-layer-2)", color: tone === "warn" ? "var(--warn-label)" : "var(--label-secondary)", border: `1px solid ${tone === "warn" ? "var(--warn-primary)" : "var(--border-l1)"}` }}>{children}</div>
	);
}

export function ProducedLine({ produced }: { produced?: { path: string; name: string } }) {
	const fs = useOS((s) => s.fs);
	if (!produced) return null;
	return (
		<div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, flexWrap: "wrap" }}>
			<span style={{ color: "var(--label-secondary)" }}>Produced</span>
			<button
				onClick={() => {
					const node = fs.stat(produced.path);
					if (node && node.kind === "file") downloadNode(node);
				}}
				title={`Download ${produced.name}`}
				className="mono"
				style={{ padding: "3px 8px", borderRadius: 6, background: "var(--bg-layer-2)", border: "1px solid var(--border-l2)", fontSize: 12 }}
			>
				{produced.name}
			</button>
			<button onClick={() => launch("explorer", { path: produced.path.slice(0, produced.path.lastIndexOf("\\")), highlight: produced.name })} style={{ color: "var(--label-secondary)", textDecoration: "underline" }}>
				show in Documents\Deliverables
			</button>
		</div>
	);
}

// ── ask ─────────────────────────────────────────────────────────────────────

function AskView({ card, status, guard, composedBy }: { card: AskCard; status: "running" | "done" | "error"; guard?: { ok: boolean; checked: number; unsupported: number[] }; composedBy?: string }) {
	const g = guard ?? card.guard;
	return (
		<CardShell title="Ask" tag={ROUTE_LABEL[card.route] ?? card.route} status={status}>
			{card.status === "insufficient" && <Callout tone="info">Nothing in the library answers this. Stratum will not state a figure it cannot cite.</Callout>}
			{card.table && <AnswerTableView table={card.table} />}
			{card.discrepancies.map((d, i) => (
				<Callout key={i}>
					<strong>Sources disagree.</strong> {d.entity} {d.period}: {d.other_source}
					{d.pq ? ` (${d.pq})` : ""} states {d.other}, against {d.reported} used here ({d.note}).
				</Callout>
			))}
			{card.intent.notes.length > 0 && <div style={{ fontSize: 11.5, color: "var(--label-tertiary)" }}>{card.intent.notes.join(" · ")}</div>}
			<Citations citations={card.citations} />
			{card.status === "answered" && <GuardLine checked={g.checked} unsupported={g.unsupported.length} extra={composedBy === "template (guard)" ? "The model's wording was replaced by the table summary." : undefined} />}
		</CardShell>
	);
}

// ── PQ ──────────────────────────────────────────────────────────────────────

function PqView({ card, status, produced }: { card: PqCard; status: "running" | "done" | "error"; produced?: { path: string; name: string } }) {
	const h = card.header;
	const unsupported = card.parts.reduce((n, p) => n + p.guard.unsupported.length, 0);
	const checked = card.parts.reduce((n, p) => n + p.guard.checked, 0);
	return (
		<CardShell title="PQ reply" tag={[h.pq_house, h.pq_number, h.pq_date].filter(Boolean).join(" · ") || "draft"} status={status}>
			{h.pq_subject && <div style={{ fontWeight: 600, fontSize: 13.5 }}>{h.pq_subject}</div>}
			{card.warnings.length > 0 && (
				<Callout>
					<strong>Review before sending — {card.warnings.length} note{card.warnings.length === 1 ? "" : "s"}</strong>
					<ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
						{card.warnings.map((w, i) => (
							<li key={i}>{w.message}</li>
						))}
					</ul>
				</Callout>
			)}
			{card.parts.map((p) => (
				<div key={p.label} style={{ fontSize: 13, lineHeight: 1.55 }}>
					<div style={{ color: "var(--label-secondary)", fontSize: 12 }}>({p.label}) {p.question}</div>
					<div style={{ whiteSpace: "pre-wrap", marginTop: 2 }}>{p.answer}</div>
				</div>
			))}
			{card.annexures.map((a) => (
				<div key={a.label}>
					<div style={LABEL}>{a.label} — part ({a.part})</div>
					<div style={{ marginTop: 6 }}>
						<AnswerTableView table={a.table} />
					</div>
				</div>
			))}
			{card.similar.length > 0 && (
				<div>
					<div style={LABEL}>Similar questions already answered</div>
					<ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12.5, lineHeight: 1.5 }}>
						{card.similar.map((s) => (
							<li key={s.document_id}>
								<button onClick={() => openDocument(s.document_id, s.filename, s.page_no)} style={{ textDecoration: "underline", textDecorationColor: "var(--border-l3)" }}>
									{[s.house, s.number, s.date && `(${s.date})`].filter(Boolean).join(" ")}
								</button>
								{s.subject ? ` — ${s.subject}` : ""}
							</li>
						))}
					</ul>
				</div>
			)}
			<ProducedLine produced={produced} />
			<Citations citations={card.citations} />
			<GuardLine checked={checked} unsupported={unsupported} />
		</CardShell>
	);
}

// ── report ──────────────────────────────────────────────────────────────────

function BarChart({ series }: { series: Record<string, Array<[string, number]>> }) {
	const names = Object.keys(series);
	const labels = names.length > 0 ? [...new Set(names.flatMap((n) => series[n].map(([x]) => x)))] : [];
	const max = Math.max(1, ...names.flatMap((n) => series[n].map(([, v]) => v)));
	const palette = ["var(--accent)", "var(--label-tertiary)", "var(--state-done)"];
	return (
		<div>
			<div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 110, padding: "4px 2px 0", borderBottom: "1px solid var(--border-l2)" }}>
				{labels.map((label) => (
					<div key={label} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 2, height: "100%" }}>
						{names.map((n, i) => {
							const v = series[n].find(([x]) => x === label)?.[1] ?? 0;
							return <div key={n} title={`${n} · ${label}: ${v}`} style={{ flex: 1, maxWidth: 18, height: `${(v / max) * 100}%`, background: palette[i % palette.length], borderRadius: "3px 3px 0 0" }} />;
						})}
					</div>
				))}
			</div>
			<div style={{ display: "flex", gap: 10, marginTop: 4 }}>
				{labels.map((label) => (
					<div key={label} style={{ flex: 1, minWidth: 0, textAlign: "center", fontSize: 10.5, color: "var(--label-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
						{label}
					</div>
				))}
			</div>
			{names.length > 1 && (
				<div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 11, color: "var(--label-secondary)" }}>
					{names.map((n, i) => (
						<span key={n} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
							<span style={{ width: 8, height: 8, borderRadius: 2, background: palette[i % palette.length] }} />
							{n}
						</span>
					))}
				</div>
			)}
		</div>
	);
}

function LineChart({ series }: { series: Record<string, Array<[string, number]>> }) {
	const names = Object.keys(series);
	const all = names.flatMap((n) => series[n]);
	if (all.length === 0) return null;
	const max = Math.max(...all.map(([, v]) => v));
	const min = Math.min(...all.map(([, v]) => v));
	const span = max - min || 1;
	const W = 420;
	const H = 110;
	return (
		<svg viewBox={`0 0 ${W} ${H + 18}`} style={{ width: "100%", height: "auto", overflow: "visible" }} role="img" aria-label="Trend">
			{names.map((n) => {
				const pts = series[n];
				const xy = pts.map(([, v], i) => [(i / Math.max(1, pts.length - 1)) * (W - 30) + 15, H - ((v - min) / span) * (H - 20) - 6] as const);
				return (
					<g key={n}>
						<polyline points={xy.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
						{xy.map(([x, y], i) => (
							<g key={i}>
								<circle cx={x} cy={y} r="3.2" fill="var(--accent)" />
								<text x={x} y={H + 12} textAnchor="middle" fontSize="9" fill="var(--label-secondary)">
									{pts[i][0].replace("FY", "")}
								</text>
							</g>
						))}
					</g>
				);
			})}
		</svg>
	);
}

function ReportView({ card, status, produced }: { card: ReportCard; status: "running" | "done" | "error"; produced?: { path: string; name: string } }) {
	return (
		<CardShell title="Report" tag={card.title} status={status}>
			{card.sections.map((s, i) => {
				switch (s.type) {
					case "heading":
						return <div key={i} style={{ fontWeight: 600, fontSize: 13 }}>{s.text}</div>;
					case "table":
						return s.table.rows.length > 0 ? <AnswerTableView key={i} table={s.table} /> : <Callout key={i} tone="info">Insufficient verified evidence available for this table.</Callout>;
					case "target_table":
						return (
							<div key={i} className="scroll" style={{ overflowX: "auto", border: "1px solid var(--border-l1)", borderRadius: 8 }}>
								<table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
									<thead>
										<tr style={{ background: "var(--bg-layer-2)", color: "var(--label-secondary)" }}>
											{["Entity", `Target ${s.period} (MT)`, `Actual ${s.period} (MT)`, "Achievement"].map((h, j) => (
												<th key={h} style={{ textAlign: j === 0 ? "left" : "right", padding: "6px 10px", fontWeight: 600 }}>{h}</th>
											))}
										</tr>
									</thead>
									<tbody>
										{s.rows.map((r) => (
											<tr key={r.entity} style={{ borderTop: "1px solid var(--border-l1)" }}>
												<td style={{ padding: "6px 10px", fontWeight: 500 }}>{r.entity}</td>
												<td className="tabular" style={{ padding: "6px 10px", textAlign: "right" }}>{r.target == null ? "—" : r.target.toFixed(2)}</td>
												<td className="tabular" style={{ padding: "6px 10px", textAlign: "right" }}>{r.actual == null ? "—" : r.actual.toFixed(2)}</td>
												<td className="tabular" style={{ padding: "6px 10px", textAlign: "right", color: r.achievement_pct != null && r.achievement_pct < 100 ? "var(--warn-label)" : undefined }}>
													{r.achievement_pct == null ? "—" : `${r.achievement_pct.toFixed(2)}%`}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						);
					case "chart":
						return s.kind === "line" ? <LineChart key={i} series={s.series} /> : <BarChart key={i} series={s.series} />;
					case "narrative":
						return <div key={i} style={{ fontSize: 13, lineHeight: 1.55 }}>{s.text.replace(/\s*\[\d+\]/g, "")}</div>;
					case "evidence":
						return (
							<div key={i} style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--label-secondary)" }}>
								{s.passages.length === 0 ? "No supporting narrative evidence found in the library." : s.passages.map((p) => <div key={p.n} style={{ marginTop: 4 }}>“{p.snippet.slice(0, 220)}…” <span style={{ color: "var(--accent)" }}>[{p.n}]</span></div>)}
							</div>
						);
				}
			})}
			<ProducedLine produced={produced} />
			<Citations citations={card.citations} />
			<GuardLine checked={card.guard.checked} unsupported={card.guard.unsupported} />
		</CardShell>
	);
}

// ── topics ──────────────────────────────────────────────────────────────────

export function TopicsView({ card, status }: { card: TopicsCard; status: "running" | "done" | "error" }) {
	if (card.status !== "ok") return <CardShell title="Topics" status={status}><Callout tone="info">{card.message ?? "Topics have not been built yet."}</Callout></CardShell>;
	const max = Math.max(1, ...card.terms.map((t) => t.count));
	return (
		<CardShell title="Topics" tag={`${card.topics.length} topics · ${card.chunks} passages · ${card.documents} documents`} status={status}>
			<div style={{ display: "flex", flexWrap: "wrap", gap: "2px 12px", alignItems: "baseline", lineHeight: 1.25 }}>
				{card.terms.slice(0, 40).map((t) => (
					<span key={t.term} title={`${t.count}`} style={{ fontSize: 11 + (t.count / max) * 16, fontWeight: t.count / max > 0.5 ? 600 : 400, color: t.count / max > 0.6 ? "var(--accent)" : "var(--label-secondary)" }}>
						{t.term}
					</span>
				))}
			</div>
			<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
				{card.topics.map((t) => (
					<div key={t.id} style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 12.5 }}>
						<span style={{ fontWeight: 600, minWidth: 0 }}>{t.label}</span>
						<Tag>{t.count} passages</Tag>
						<span style={{ color: "var(--label-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.keywords.slice(0, 5).join(", ")}</span>
					</div>
				))}
			</div>
		</CardShell>
	);
}

/** The card for one tool block: the engine's JSON turned into tables, chips and notes. */
export function ToolCard({ block }: { block: { tool: ToolResult["tool"]; status: "running" | "done" | "error"; card?: ToolResult["card"]; error?: string; produced?: { path: string; name: string }; guard?: { ok: boolean; checked: number; unsupported: number[] }; composedBy?: string } }) {
	const titles: Record<string, string> = { stratum_ask: "Ask", stratum_pq_reply: "PQ reply", stratum_report: "Report", stratum_topics: "Topics" };
	if (!block.card) {
		return (
			<CardShell title={titles[block.tool] ?? block.tool} status={block.status}>
				<div style={{ fontSize: 12.5, color: "var(--label-secondary)" }}>{block.error ?? (block.tool === "stratum_pq_reply" ? "Drafting the reply part by part…" : block.tool === "stratum_report" ? "Building the report from verified facts…" : "Looking it up in the library…")}</div>
			</CardShell>
		);
	}
	switch (block.card.kind) {
		case "ask":
			return <AskView card={block.card} status={block.status} guard={block.guard} composedBy={block.composedBy} />;
		case "pq":
			return <PqView card={block.card} status={block.status} produced={block.produced} />;
		case "report":
			return <ReportView card={block.card} status={block.status} produced={block.produced} />;
		case "topics":
			return <TopicsView card={block.card} status={block.status} />;
	}
}
