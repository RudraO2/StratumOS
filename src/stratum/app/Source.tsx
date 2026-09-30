/**
 * The source viewer: a library document in its original form, with the exact place a figure or passage came
 * from marked on it. PDFs are drawn page by page with pdf.js (so nothing is handed to the browser's own
 * viewer, and nothing downloads); a spreadsheet is drawn as a grid. Downloading the original is a separate,
 * explicit button.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AppProps } from "../../os/kernel/apps";
import { library } from "../engine";
import viewerData from "../data/viewer.json";
import { StateDot, type DotState } from "./components/ui";

export interface SourceTarget {
	documentId: number;
	page?: number | null;
	/** Normalised [x0, y0, x1, y1], origin top-left. */
	bbox?: number[] | null;
	factId?: number;
	chunkId?: number;
	/** What to say about a passage (its snippet), when there is no fact. */
	snippet?: string;
}

const data = viewerData as unknown as {
	sheets: Record<string, Array<{ id: number; caption: string; cells: string[][] }>>;
	factCells: Record<string, { table: number; row: number; col: number }>;
	chunkBbox: Record<string, number[]>;
};

const KIND: Record<string, string> = { annual_report: "Annual report", provisional_stats: "Provisional statistics", press_release: "Press release", coal_directory: "Coal directory (scanned)", spreadsheet: "Spreadsheet", pq_reply: "Parliament reply", document: "Document" };
const STATUS_DOT: Record<string, DotState> = { verified: "done", consistent: "done", flagged: "warning", rejected: "error" };
const PANEL_LABEL = { color: "var(--label-tertiary)", fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" as const };

type Pdfjs = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<Pdfjs> | null = null;
function loadPdfjs(): Promise<Pdfjs> {
	pdfjsPromise ??= Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]).then(([lib, worker]) => {
		lib.GlobalWorkerOptions.workerSrc = worker.default;
		return lib;
	});
	return pdfjsPromise;
}

export function Source({ args, nonce }: AppProps) {
	const initial = (args ?? {}) as unknown as SourceTarget;
	const [target, setTarget] = useState<SourceTarget>(initial);
	useEffect(() => setTarget((args ?? {}) as unknown as SourceTarget), [args, nonce]);
	const doc = library.documents().find((d) => d.id === target.documentId);
	if (!doc) return <div style={{ padding: 24, color: "var(--label-secondary)" }}>That document is not in the library.</div>;
	const isPdf = doc.filename.toLowerCase().endsWith(".pdf");
	return (
		<div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: "var(--bg-layer-2)", fontSize: 13 }}>
			<header style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 14px", borderBottom: "1px solid var(--border-l1)", background: "var(--bg-layer-1)" }}>
				<div style={{ minWidth: 0, flex: 1 }}>
					<div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.filename}</div>
					<div style={{ fontSize: 11.5, color: "var(--label-secondary)" }}>
						{KIND[doc.doc_kind] ?? doc.doc_kind}
						{doc.pq_number ? ` · ${[doc.pq_house, doc.pq_number, doc.pq_date].filter(Boolean).join(" ")}` : ""}
						{doc.is_provisional ? " · provisional" : ""} · sample document
					</div>
				</div>
				<a href={`/library/${doc.filename}`} download={doc.filename} title="Save the original file to this computer" style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border-l2)", background: "var(--bg-layer-2)", fontSize: 12, color: "var(--label-primary)", textDecoration: "none", whiteSpace: "nowrap" }}>
					Download original
				</a>
			</header>
			<div style={{ flex: 1, minHeight: 0, display: "flex" }}>
				{isPdf ? <PdfPane doc={doc} target={target} setTarget={setTarget} /> : <SheetPane doc={doc} target={target} setTarget={setTarget} />}
				<Explain doc={doc} target={target} setTarget={setTarget} />
			</div>
		</div>
	);
}

// ── where the highlight is ──────────────────────────────────────────────────

function resolveBox(t: SourceTarget): number[] | null {
	if (t.bbox && t.bbox.length === 4) return t.bbox;
	if (t.factId !== undefined) {
		const f = library.facts().find((x) => x.id === t.factId);
		if (f?.bbox && f.bbox.length === 4) return f.bbox;
	}
	if (t.chunkId !== undefined) return data.chunkBbox[String(t.chunkId)] ?? null;
	return null;
}

function resolvePage(t: SourceTarget): number {
	if (t.page) return t.page;
	const f = t.factId !== undefined ? library.facts().find((x) => x.id === t.factId) : undefined;
	return f?.page_no ?? 1;
}

// ── PDF ─────────────────────────────────────────────────────────────────────

function PdfPane({ doc, target, setTarget }: { doc: { id: number; filename: string }; target: SourceTarget; setTarget: (t: SourceTarget) => void }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const [pdf, setPdf] = useState<import("pdfjs-dist").PDFDocumentProxy | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [zoom, setZoom] = useState(1);
	const [size, setSize] = useState<{ w: number; h: number } | null>(null);
	const [textBoxes, setTextBoxes] = useState<number[][]>([]);
	const page = resolvePage(target);
	const box = resolveBox(target);

	useEffect(() => {
		let cancelled = false;
		setPdf(null);
		setError(null);
		loadPdfjs()
			.then((lib) => lib.getDocument({ url: `/library/${doc.filename}` }).promise)
			.then((p) => !cancelled && setPdf(p))
			.catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
		return () => {
			cancelled = true;
		};
	}, [doc.filename]);

	useEffect(() => {
		if (!pdf) return;
		let cancelled = false;
		let task: { cancel(): void } | null = null;
		(async () => {
			const n = Math.min(Math.max(1, page), pdf.numPages);
			const pg = await pdf.getPage(n);
			const host = scrollRef.current;
			const fit = host ? Math.max(0.4, (host.clientWidth - 48) / pg.getViewport({ scale: 1 }).width) : 1.2;
			const scale = fit * zoom;
			const viewport = pg.getViewport({ scale });
			const canvas = canvasRef.current;
			if (!canvas || cancelled) return;
			const ratio = window.devicePixelRatio || 1;
			canvas.width = Math.floor(viewport.width * ratio);
			canvas.height = Math.floor(viewport.height * ratio);
			canvas.style.width = `${viewport.width}px`;
			canvas.style.height = `${viewport.height}px`;
			setSize({ w: viewport.width, h: viewport.height });
			const render = pg.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined });
			task = render;
			await render.promise.catch(() => undefined);
			// With no stored region (a passage), mark the words of the snippet that the page's text layer holds.
			if (!box && target.snippet && !cancelled) {
				const content = await pg.getTextContent();
				const snippet = norm(target.snippet);
				const found: number[][] = [];
				for (const item of content.items) {
					if (!("str" in item)) continue;
					const s = norm(item.str);
					if (s.length < 4 || !snippet.includes(s)) continue;
					const x = item.transform[4];
					const y = item.transform[5];
					const h = item.height || Math.abs(item.transform[3]) || 10;
					const base = pg.getViewport({ scale: 1 });
					found.push([x / base.width, 1 - (y + h) / base.height, (x + item.width) / base.width, 1 - (y - h * 0.25) / base.height]);
				}
				if (!cancelled) setTextBoxes(found);
			} else if (!cancelled) setTextBoxes([]);
		})().catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
		return () => {
			cancelled = true;
			task?.cancel();
		};
	}, [pdf, page, zoom, box?.join(","), target.snippet]);

	useEffect(() => {
		const host = scrollRef.current;
		const b = box ?? textBoxes[0];
		if (!host || !size || !b) return;
		host.scrollTo({ top: Math.max(0, b[1] * size.h - host.clientHeight / 3 + 24), behavior: "smooth" });
	}, [size?.h, box?.join(","), textBoxes.length]);

	const pages = pdf?.numPages ?? 1;
	const go = (n: number) => setTarget({ documentId: target.documentId, page: Math.min(pages, Math.max(1, n)) });
	const tool = (label: string, onClick: () => void, disabled?: boolean) => (
		<button onClick={onClick} disabled={disabled} aria-label={label} title={label} style={{ width: 28, height: 28, borderRadius: 6, fontSize: 16, color: disabled ? "var(--label-tertiary)" : "var(--label-primary)" }} onPointerEnter={(e) => !disabled && (e.currentTarget.style.background = "var(--interactive-hover)")} onPointerLeave={(e) => (e.currentTarget.style.background = "")}>
			{label.startsWith("Zoom in") ? "+" : label.startsWith("Zoom out") ? "−" : label.startsWith("Previous") ? "‹" : label.startsWith("Next") ? "›" : "⤢"}
		</button>
	);
	const drawn = box ? [box] : textBoxes;
	return (
		<div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
			<div style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 12px", borderBottom: "1px solid var(--border-l1)", background: "var(--bg-layer-1)" }}>
				{tool("Previous page", () => go(page - 1), page <= 1)}
				<span className="tabular" style={{ minWidth: 70, textAlign: "center", fontSize: 12 }}>
					Page {Math.min(page, pages)} of {pages}
				</span>
				{tool("Next page", () => go(page + 1), page >= pages)}
				<span style={{ flex: 1 }} />
				{tool("Zoom out", () => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2))), zoom <= 0.5)}
				<span className="tabular" style={{ minWidth: 44, textAlign: "center", fontSize: 12 }}>{Math.round(zoom * 100)}%</span>
				{tool("Zoom in", () => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2))), zoom >= 3)}
				{tool("Fit to width", () => setZoom(1))}
			</div>
			<div ref={scrollRef} className="scroll" style={{ flex: 1, overflow: "auto", padding: 24, display: "flex", justifyContent: size && size.w > 0 ? "safe center" : "center", alignItems: "flex-start" }}>
				{error && <div style={{ color: "var(--error-primary)", padding: 16 }}>Could not draw this document: {error}</div>}
				{!pdf && !error && <div style={{ color: "var(--label-tertiary)", padding: 40 }}>Opening the document…</div>}
				<div style={{ position: "relative", display: pdf ? "block" : "none", boxShadow: "0 1px 3px rgba(0,0,0,0.25), 0 8px 28px rgba(0,0,0,0.18)", background: "#ffffff", flex: "0 0 auto" }}>
					<canvas ref={canvasRef} style={{ display: "block" }} />
					{size &&
						drawn.map((b, i) => (
							<div
								key={i}
								aria-label="The exact source"
								className="st-source-hit"
								style={{ position: "absolute", left: `${b[0] * 100}%`, top: `${b[1] * 100}%`, width: `${(b[2] - b[0]) * 100}%`, height: `${(b[3] - b[1]) * 100}%`, border: "2px solid var(--accent)", background: "color-mix(in srgb, var(--accent) 22%, transparent)", borderRadius: 3, boxShadow: "0 0 0 4px color-mix(in srgb, var(--accent) 16%, transparent)", pointerEvents: "none" }}
							/>
						))}
				</div>
			</div>
		</div>
	);
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9.%]+/g, " ").trim();

// ── spreadsheet ─────────────────────────────────────────────────────────────

function colName(i: number) {
	let n = i;
	let s = "";
	do {
		s = String.fromCharCode(65 + (n % 26)) + s;
		n = Math.floor(n / 26) - 1;
	} while (n >= 0);
	return s;
}

function SheetPane({ doc, target, setTarget }: { doc: { id: number; filename: string }; target: SourceTarget; setTarget: (t: SourceTarget) => void }) {
	const tables = data.sheets[String(doc.id)] ?? [];
	const cell = target.factId !== undefined ? data.factCells[String(target.factId)] : undefined;
	const hitRef = useRef<HTMLTableCellElement>(null);
	useEffect(() => hitRef.current?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" }), [target.factId, nonceKey(target)]);
	if (tables.length === 0) return <div style={{ flex: 1, padding: 24, color: "var(--label-secondary)" }}>This file has no table the library read.</div>;
	return (
		<div className="scroll" style={{ flex: 1, minWidth: 0, overflow: "auto", padding: 20 }}>
			{tables.map((t) => (
				<div key={t.id} style={{ marginBottom: 22 }}>
					<div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8, color: "var(--label-secondary)" }}>{t.caption.replace(/�/g, "–")}</div>
					<table style={{ borderCollapse: "collapse", background: "var(--bg-layer-1)", boxShadow: "0 1px 3px rgba(0,0,0,0.15)", fontSize: 12.5 }}>
						<thead>
							<tr>
								<th style={headCell} />
								{(t.cells[0] ?? []).map((_, c) => (
									<th key={c} style={headCell}>{colName(c)}</th>
								))}
							</tr>
						</thead>
						<tbody>
							{t.cells.map((row, r) => (
								<tr key={r}>
									<th style={{ ...headCell, textAlign: "right" }}>{r + 1}</th>
									{row.map((text, c) => {
										const hit = cell !== undefined && cell.table === t.id && cell.row === r && cell.col === c;
										const inRow = cell !== undefined && cell.table === t.id && cell.row === r && !hit;
										return (
											<td
												key={c}
												ref={hit ? hitRef : undefined}
												style={{ border: "1px solid var(--border-l1)", padding: "6px 12px", whiteSpace: "nowrap", fontWeight: r === 0 ? 600 : 400, background: hit ? "color-mix(in srgb, var(--accent) 26%, var(--bg-layer-1))" : inRow ? "color-mix(in srgb, var(--accent) 7%, var(--bg-layer-1))" : r === 0 ? "var(--bg-layer-2)" : undefined, outline: hit ? "2px solid var(--accent)" : undefined, outlineOffset: -2, textAlign: c === 0 ? "left" : "right" }}
												className={c === 0 ? undefined : "tabular"}
											>
												{text}
											</td>
										);
									})}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			))}
			<div style={{ fontSize: 11.5, color: "var(--label-tertiary)" }}>The original workbook, as the library read it. Figures here are in lakh tonnes; the fact converts them to million tonnes.</div>
		</div>
	);
}

const nonceKey = (t: SourceTarget) => `${t.factId}-${t.chunkId}-${t.page}`;
const headCell = { border: "1px solid var(--border-l1)", padding: "4px 10px", background: "var(--bg-layer-2)", color: "var(--label-tertiary)", fontWeight: 500, fontSize: 11.5 } as const;

// ── what is being pointed at ────────────────────────────────────────────────

function Explain({ doc, target, setTarget }: { doc: { id: number; filename: string }; target: SourceTarget; setTarget: (t: SourceTarget) => void }) {
	const lineage = target.factId !== undefined ? library.lineage(target.factId) : null;
	const page = resolvePage(target);
	const onPage = useMemo(() => library.facts({ document_id: doc.id }).filter((f) => !doc.filename.endsWith(".pdf") || (f.page_no ?? 1) === page), [doc.id, doc.filename, page]);
	const passage = target.chunkId !== undefined ? library.documents() && target.snippet : undefined;
	const row = (label: string, value: ReactNode) => (
		<div style={{ display: "flex", gap: 10, padding: "4px 0", fontSize: 12.5 }}>
			<span style={{ width: 70, flex: "0 0 auto", color: "var(--label-tertiary)" }}>{label}</span>
			<span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{value}</span>
		</div>
	);
	return (
		<aside className="scroll" style={{ width: 290, flex: "0 0 auto", overflowY: "auto", borderLeft: "1px solid var(--border-l1)", background: "var(--bg-layer-1)", padding: "14px 14px 20px" }}>
			<div style={PANEL_LABEL}>Where this came from</div>
			{lineage ? (
				<div style={{ marginTop: 8 }}>
					<div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3 }}>
						{lineage.value} {lineage.unit_label}
					</div>
					<div style={{ fontSize: 12.5, color: "var(--label-secondary)", marginBottom: 8 }}>
						{lineage.entity_name} · {lineage.metric_label} · {lineage.period}
					</div>
					{row("Page", doc.filename.endsWith(".pdf") ? lineage.page_no ?? "—" : "spreadsheet")}
					{row("Cell text", lineage.raw_text ? <span className="mono">{lineage.raw_text}</span> : "—")}
					{lineage.conversion && row("Converted", lineage.conversion)}
					{row("Status", <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><StateDot state={STATUS_DOT[lineage.status] ?? "done"} size={7} />{lineage.status}{lineage.is_provisional ? " · provisional" : ""}</span>)}
					<div style={{ ...PANEL_LABEL, margin: "12px 0 4px" }}>Checks</div>
					{lineage.checks.map((c, i) => (
						<div key={i} style={{ display: "flex", gap: 7, fontSize: 12, padding: "2px 0", alignItems: "flex-start" }}>
							<StateDot state={c.result === "pass" ? "done" : c.result === "fail" ? "error" : "warning"} size={7} style={{ marginTop: 5 }} />
							<span>
								<span style={{ fontWeight: 500 }}>{c.check_name.replace(/_/g, " ")}</span>
								<span style={{ color: "var(--label-secondary)" }}> — {c.detail}</span>
							</span>
						</div>
					))}
				</div>
			) : passage ? (
				<div style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.5 }}>
					<div style={{ color: "var(--label-secondary)", marginBottom: 6 }}>Passage · page {page}</div>
					“{passage.length > 420 ? `${passage.slice(0, 420)}…` : passage}”
				</div>
			) : (
				<div style={{ marginTop: 8, fontSize: 12.5, color: "var(--label-secondary)", lineHeight: 1.5 }}>Nothing is highlighted. Pick a fact below to see exactly where it was read.</div>
			)}
			{onPage.length > 0 && (
				<>
					<div style={{ ...PANEL_LABEL, margin: "16px 0 6px" }}>{doc.filename.endsWith(".pdf") ? "Facts read from this page" : "Facts read from this file"} ({onPage.length})</div>
					<div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
						{onPage.map((f) => (
							<button
								key={f.id}
								onClick={() => setTarget({ documentId: doc.id, page: f.page_no ?? 1, factId: f.id })}
								style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "5px 8px", borderRadius: 6, fontSize: 12, textAlign: "left", background: target.factId === f.id ? "var(--selector)" : "transparent" }}
								onPointerEnter={(e) => (e.currentTarget.style.background = "var(--interactive-hover)")}
								onPointerLeave={(e) => (e.currentTarget.style.background = target.factId === f.id ? "var(--selector)" : "transparent")}
							>
								<span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
									{f.entity_code.replace("STATE:", "")} · {f.metric.replace(/_/g, " ")} · {f.period}
								</span>
								<span className="tabular" style={{ color: "var(--label-secondary)" }}>{f.value}</span>
							</button>
						))}
					</div>
				</>
			)}
		</aside>
	);
}
