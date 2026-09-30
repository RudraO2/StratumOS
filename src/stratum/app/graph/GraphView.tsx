/**
 * The map: the whole library as one connected picture. Documents, the entities they state figures for, the
 * measures, the years and the topics are nodes; conflicts between documents are red links; an entity with no
 * figure for the chosen year is a dashed ring. Select a node for what the library holds about it, or press
 * "Show on map" under an answer to see exactly which nodes that answer rested on.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useOS } from "../../../os/kernel/store";
import { openDocument } from "../components/Cards";
import { StateDot } from "../components/ui";
import { useStratum } from "../store";
import { runTurn } from "../turn";
import { buildGraph, documentsOf, entityMetrics, entityName, metricName, questionFor, shortPeriod, stateFor, trend, type Conflict, type GEdge, type GNode, type Graph, type NodeKind } from "./model";
import { bounds, Sim } from "./sim";

const LAYERS: Array<[NodeKind, string]> = [
	["document", "Documents"],
	["entity", "Entities"],
	["metric", "Measures"],
	["period", "Years"],
	["topic", "Topics"],
];

type Colors = Record<"ink" | "ink2" | "ink3" | "line" | "line3" | "surface" | "surface2" | "surface3" | "accent" | "bad" | "warn" | "ok", string>;

function readColors(el: HTMLElement): Colors {
	const cs = getComputedStyle(el);
	const v = (name: string) => cs.getPropertyValue(name).trim() || "#888";
	return { ink: v("--label-primary"), ink2: v("--label-secondary"), ink3: v("--label-tertiary"), line: v("--border-l1"), line3: v("--border-l3"), surface: v("--bg-layer-1"), surface2: v("--bg-layer-2"), surface3: v("--bg-layer-3"), accent: v("--accent"), bad: v("--error-primary"), warn: v("--warn-primary"), ok: v("--state-done") };
}

interface View {
	k: number;
	x: number;
	y: number;
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
	const dx = bx - ax;
	const dy = by - ay;
	const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
	return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function MapView() {
	const graph = useMemo(() => buildGraph(), []);
	const sim = useMemo(() => {
		const s = new Sim(graph);
		s.settle(280);
		s.alpha = 0.05;
		return s;
	}, [graph]);
	const theme = useOS((s) => s.theme);
	const trace = useStratum((s) => s.trace);
	const setTrace = useStratum((s) => s.setTrace);
	const setView = useStratum((s) => s.setView);

	const wrapRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const viewRef = useRef<View>({ k: 1, x: 0, y: 0 });
	const dirty = useRef(true);
	const size = useRef({ w: 10, h: 10 });
	const colors = useRef<Colors | null>(null);

	const [year, setYear] = useState("");
	const [metric, setMetric] = useState("coal_production");
	const [layers, setLayers] = useState<Set<NodeKind>>(new Set(["document", "entity", "metric", "period", "topic"]));
	const [selected, setSelected] = useState<string | null>(null);
	const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
	const [hover, setHover] = useState<string | null>(null);
	const [query, setQuery] = useState("");

	const traceSet = useMemo(() => (trace ? new Set(trace.ids) : null), [trace]);
	const ui = useRef({ year, metric, layers, selected, selectedEdge, hover, traceSet });
	ui.current = { year, metric, layers, selected, selectedEdge, hover, traceSet };
	useEffect(() => {
		dirty.current = true;
	}, [year, metric, layers, selected, selectedEdge, hover, traceSet, theme]);

	const fit = useCallback(() => {
		const visible = graph.nodes.filter((n) => ui.current.layers.has(n.kind));
		const b = bounds(visible.length > 0 ? visible : graph.nodes);
		const { w, h } = size.current;
		const k = Math.min(2, Math.max(0.3, Math.min((w - 120) / (b.x1 - b.x0), (h - 140) / (b.y1 - b.y0))));
		viewRef.current = { k, x: w / 2 - ((b.x0 + b.x1) / 2) * k, y: h / 2 - ((b.y0 + b.y1) / 2) * k };
		dirty.current = true;
	}, [graph]);

	// Size, colours and first fit.
	useEffect(() => {
		const wrap = wrapRef.current;
		const canvas = canvasRef.current;
		if (!wrap || !canvas) return;
		let first = true;
		const resize = () => {
			const ratio = window.devicePixelRatio || 1;
			const w = wrap.clientWidth;
			const h = wrap.clientHeight;
			size.current = { w, h };
			canvas.width = Math.floor(w * ratio);
			canvas.height = Math.floor(h * ratio);
			canvas.style.width = `${w}px`;
			canvas.style.height = `${h}px`;
			if (first) {
				first = false;
				fit();
			}
			dirty.current = true;
		};
		resize();
		const ro = new ResizeObserver(resize);
		ro.observe(wrap);
		return () => ro.disconnect();
	}, [fit]);

	useEffect(() => {
		colors.current = wrapRef.current ? readColors(wrapRef.current) : null;
		dirty.current = true;
	}, [theme]);

	const toWorld = (sx: number, sy: number) => ({ x: (sx - viewRef.current.x) / viewRef.current.k, y: (sy - viewRef.current.y) / viewRef.current.k });
	const nodeAt = (sx: number, sy: number): GNode | null => {
		const { x, y } = toWorld(sx, sy);
		let best: GNode | null = null;
		for (const n of graph.nodes) {
			if (!ui.current.layers.has(n.kind)) continue;
			if (Math.hypot(n.x - x, n.y - y) <= n.r + 4 / viewRef.current.k) best = n;
		}
		return best;
	};
	const edgeAt = (sx: number, sy: number): GEdge | null => {
		const { x, y } = toWorld(sx, sy);
		for (const e of graph.edges) {
			if (e.kind !== "conflict") continue;
			const a = graph.byId.get(e.a);
			const b = graph.byId.get(e.b);
			if (a && b && distToSegment(x, y, a.x, a.y, b.x, b.y) < 7 / viewRef.current.k) return e;
		}
		return null;
	};

	// The draw loop: the layout runs until it settles, then frames are drawn only when something changed.
	useEffect(() => {
		let raf = 0;
		const draw = () => {
			raf = requestAnimationFrame(draw);
			if (!sim.settled) {
				sim.tick();
				dirty.current = true;
			}
			if (!dirty.current) return;
			dirty.current = false;
			const canvas = canvasRef.current;
			const c = colors.current ?? (wrapRef.current ? (colors.current = readColors(wrapRef.current)) : null);
			if (!canvas || !c) return;
			const ctx = canvas.getContext("2d");
			if (ctx) paint(ctx, graph, c, viewRef.current, size.current, ui.current);
		};
		raf = requestAnimationFrame(draw);
		return () => cancelAnimationFrame(raf);
	}, [graph, sim]);

	// Pointer: drag a node, pan the background, click to select, wheel to zoom.
	const drag = useRef<{ kind: "node" | "pan"; node?: GNode; sx: number; sy: number; moved: boolean; vx: number; vy: number } | null>(null);
	const pos = (e: React.PointerEvent | React.WheelEvent) => {
		const r = canvasRef.current!.getBoundingClientRect();
		return { sx: e.clientX - r.left, sy: e.clientY - r.top };
	};
	const onDown = (e: React.PointerEvent) => {
		const { sx, sy } = pos(e);
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		const n = nodeAt(sx, sy);
		drag.current = { kind: n ? "node" : "pan", node: n ?? undefined, sx, sy, moved: false, vx: viewRef.current.x, vy: viewRef.current.y };
		if (n) n.pinned = true;
	};
	const onMove = (e: React.PointerEvent) => {
		const { sx, sy } = pos(e);
		const d = drag.current;
		if (!d) {
			const n = nodeAt(sx, sy);
			const id = n?.id ?? null;
			if (id !== ui.current.hover) setHover(id);
			canvasRef.current!.style.cursor = n || edgeAt(sx, sy) ? "pointer" : "grab";
			return;
		}
		if (Math.hypot(sx - d.sx, sy - d.sy) > 3) d.moved = true;
		if (d.kind === "node" && d.node && d.moved) {
			const w = toWorld(sx, sy);
			d.node.x = w.x;
			d.node.y = w.y;
			sim.reheat(0.25);
		} else if (d.kind === "pan") {
			viewRef.current = { ...viewRef.current, x: d.vx + (sx - d.sx), y: d.vy + (sy - d.sy) };
			dirty.current = true;
		}
	};
	const onUp = (e: React.PointerEvent) => {
		const d = drag.current;
		drag.current = null;
		if (!d) return;
		if (d.node) d.node.pinned = false;
		if (!d.moved) {
			const { sx, sy } = pos(e);
			const n = nodeAt(sx, sy);
			if (n) {
				setSelected(n.id);
				setSelectedEdge(null);
			} else {
				const edge = edgeAt(sx, sy);
				setSelectedEdge(edge?.id ?? null);
				setSelected(null);
			}
		}
	};
	const zoomAt = (factor: number, sx: number, sy: number) => {
		const v = viewRef.current;
		const k = Math.min(3, Math.max(0.25, v.k * factor));
		const f = k / v.k;
		viewRef.current = { k, x: sx - (sx - v.x) * f, y: sy - (sy - v.y) * f };
		dirty.current = true;
	};
	useEffect(() => {
		const el = canvasRef.current;
		if (!el) return;
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			const r = el.getBoundingClientRect();
			zoomAt(Math.exp(-e.deltaY * 0.0016), e.clientX - r.left, e.clientY - r.top);
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, []);

	const focusOn = (n: GNode) => {
		setSelected(n.id);
		setSelectedEdge(null);
		const { w, h } = size.current;
		const k = Math.max(viewRef.current.k, 1);
		viewRef.current = { k, x: w / 2 - n.x * k - 130, y: h / 2 - n.y * k };
		dirty.current = true;
	};

	const matches = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (q.length < 1) return [];
		return graph.nodes.filter((n) => `${n.label} ${n.sub}`.toLowerCase().includes(q)).slice(0, 7);
	}, [query, graph]);

	const toggleLayer = (k: NodeKind) => {
		const next = new Set(layers);
		if (next.has(k)) next.delete(k);
		else next.add(k);
		setLayers(next);
		window.setTimeout(fit, 0);
	};

	const selNode = selected ? graph.byId.get(selected) : undefined;
	const selEdge = selectedEdge ? graph.edges.find((e) => e.id === selectedEdge) : undefined;
	const ask = (text: string) => {
		setView("ask");
		window.setTimeout(() => void runTurn(text), 60);
	};

	return (
		<div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", background: "var(--bg-layer-1)" }}>
			<div ref={wrapRef} style={{ position: "relative", flex: 1, minWidth: 0, overflow: "hidden", background: "radial-gradient(1000px 600px at 50% 40%, color-mix(in srgb, var(--accent) 5%, var(--bg-layer-1)), var(--bg-layer-1))" }}>
				<canvas ref={canvasRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => setHover(null)} style={{ position: "absolute", inset: 0, touchAction: "none", cursor: "grab" }} />

				<div style={{ position: "absolute", top: 14, left: 16, right: 16, display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap", pointerEvents: "none" }}>
					<div style={{ position: "relative", pointerEvents: "auto" }}>
						<input
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Find a document, subsidiary, year…"
							aria-label="Find a node"
							style={{ width: 240, height: 32, padding: "0 12px", borderRadius: 8, border: "1px solid var(--border-l2)", background: "var(--bg-layer-1)", outline: "none", fontSize: 12.5, boxShadow: "var(--shadow-lv2)" }}
						/>
						{matches.length > 0 && (
							<div className="fade-up" style={{ position: "absolute", top: 38, left: 0, width: 280, background: "var(--bg-layer-1)", border: "1px solid var(--border-l2)", borderRadius: 10, boxShadow: "var(--shadow-lv2)", padding: 4, zIndex: 5 }}>
								{matches.map((n) => (
									<button
										key={n.id}
										onClick={() => {
											focusOn(n);
											setQuery("");
										}}
										style={{ display: "flex", gap: 8, width: "100%", padding: "6px 8px", borderRadius: 6, textAlign: "left", fontSize: 12.5, alignItems: "baseline" }}
										onPointerEnter={(e) => (e.currentTarget.style.background = "var(--interactive-hover)")}
										onPointerLeave={(e) => (e.currentTarget.style.background = "")}
									>
										<span style={{ fontWeight: 500 }}>{n.label}</span>
										<span style={{ color: "var(--label-tertiary)", fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.kind} · {n.sub}</span>
									</button>
								))}
							</div>
						)}
					</div>
					<Select label="Year" value={year} onChange={setYear}>
						<option value="">All years</option>
						{graph.periods.map((p) => (
							<option key={p} value={p}>{p}</option>
						))}
					</Select>
					<Select label="Measure" value={metric} onChange={setMetric}>
						{graph.metrics.map((m) => (
							<option key={m.key} value={m.key}>{m.label}</option>
						))}
					</Select>
					<div style={{ display: "flex", gap: 4, pointerEvents: "auto", flexWrap: "wrap" }}>
						{LAYERS.map(([k, label]) => (
							<button
								key={k}
								onClick={() => toggleLayer(k)}
								aria-pressed={layers.has(k)}
								style={{ height: 32, padding: "0 10px", borderRadius: 8, border: "1px solid var(--border-l2)", background: layers.has(k) ? "var(--bg-layer-1)" : "var(--bg-layer-2)", color: layers.has(k) ? "var(--label-primary)" : "var(--label-tertiary)", fontSize: 12, boxShadow: layers.has(k) ? "var(--shadow-lv2)" : undefined }}
							>
								{label}
							</button>
						))}
					</div>
				</div>

				{trace && (
					<div className="fade-up" style={{ position: "absolute", left: 16, bottom: 16, maxWidth: "min(520px, calc(100% - 32px))", display: "flex", alignItems: "center", gap: 10, padding: "8px 8px 8px 14px", borderRadius: 12, background: "var(--bg-layer-1)", border: "1px solid var(--accent)", boxShadow: "var(--shadow-lv2)", fontSize: 12.5 }}>
						<span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--accent)", flex: "0 0 auto" }} />
						<span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
							<strong>This answer rests on {trace.ids.length} nodes.</strong> <span style={{ color: "var(--label-secondary)" }}>{trace.label}</span>
						</span>
						<button onClick={() => setTrace(null)} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border-l2)", fontSize: 12, flex: "0 0 auto" }}>Clear</button>
					</div>
				)}

				<Legend hasTrace={!!trace} conflicts={graph.conflicts.length} />

				<div style={{ position: "absolute", right: selNode || selEdge ? 344 : 16, bottom: 16, display: "flex", flexDirection: "column", gap: 4, transition: "right 120ms ease" }}>
					{[
						["+", "Zoom in", () => zoomAt(1.25, size.current.w / 2, size.current.h / 2)],
						["−", "Zoom out", () => zoomAt(0.8, size.current.w / 2, size.current.h / 2)],
						["⤢", "Fit everything", fit],
					].map(([glyph, label, fn]) => (
						<button key={label as string} onClick={fn as () => void} aria-label={label as string} title={label as string} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border-l2)", background: "var(--bg-layer-1)", fontSize: 16, boxShadow: "var(--shadow-lv2)" }}>
							{glyph as string}
						</button>
					))}
				</div>
			</div>

			{(selNode || selEdge) && (
				<aside className="scroll fade-in" style={{ width: 328, flex: "0 0 auto", overflowY: "auto", borderLeft: "1px solid var(--border-l1)", background: "var(--bg-layer-1)", padding: "14px 16px 24px" }}>
					{selNode && <NodePanel graph={graph} node={selNode} year={year} metric={metric} onSelect={(id) => { setSelected(id); setSelectedEdge(null); }} onClose={() => setSelected(null)} onAsk={ask} />}
					{selEdge && <ConflictPanel edge={selEdge} graph={graph} onClose={() => setSelectedEdge(null)} />}
				</aside>
			)}
		</div>
	);
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
	return (
		<label style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 4px 0 10px", borderRadius: 8, border: "1px solid var(--border-l2)", background: "var(--bg-layer-1)", fontSize: 12, color: "var(--label-secondary)", pointerEvents: "auto", boxShadow: "var(--shadow-lv2)" }}>
			{label}
			<select value={value} onChange={(e) => onChange(e.target.value)} style={{ border: "none", background: "transparent", outline: "none", fontSize: 12.5, color: "var(--label-primary)", height: 28, maxWidth: 170 }}>
				{children}
			</select>
		</label>
	);
}

function Legend({ hasTrace, conflicts }: { hasTrace: boolean; conflicts: number }) {
	const item = (shape: ReactNode, text: string) => (
		<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
			{shape}
			{text}
		</span>
	);
	const sw = (style: React.CSSProperties) => <span style={{ width: 10, height: 10, display: "inline-block", ...style }} />;
	return (
		<div style={{ position: "absolute", left: 16, bottom: hasTrace ? 68 : 16, display: "flex", gap: 14, flexWrap: "wrap", maxWidth: "60%", fontSize: 11.5, color: "var(--label-secondary)" }}>
			{item(sw({ borderRadius: 3, border: "1.5px solid var(--label-tertiary)" }), "Document")}
			{item(sw({ borderRadius: "50%", background: "color-mix(in srgb, var(--accent) 45%, transparent)", border: "1.5px solid var(--accent)" }), "Entity")}
			{item(sw({ transform: "rotate(45deg) scale(0.8)", background: "var(--label-secondary)" }), "Measure")}
			{item(sw({ borderRadius: "50%", border: "1.5px dashed var(--label-tertiary)" }), "Topic")}
			{item(<span style={{ width: 16, borderTop: "2px solid var(--error-primary)" }} />, `Conflict (${conflicts})`)}
			{item(sw({ borderRadius: "50%", border: "1.5px dashed var(--error-primary)" }), "No figure for the year")}
		</div>
	);
}

// ── painting ────────────────────────────────────────────────────────────────

interface Ui {
	year: string;
	metric: string;
	layers: Set<NodeKind>;
	selected: string | null;
	selectedEdge: string | null;
	hover: string | null;
	traceSet: Set<string> | null;
}

function paint(ctx: CanvasRenderingContext2D, g: Graph, c: Colors, v: View, size: { w: number; h: number }, ui: Ui) {
	const ratio = window.devicePixelRatio || 1;
	ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
	ctx.clearRect(0, 0, size.w, size.h);
	ctx.save();
	ctx.translate(v.x, v.y);
	ctx.scale(v.k, v.k);

	const focus = ui.hover ?? ui.selected;
	const near = new Set<string>();
	if (focus) {
		near.add(focus);
		for (const e of g.edges) {
			if (e.a === focus) near.add(e.b);
			else if (e.b === focus) near.add(e.a);
		}
	}
	const traced = ui.traceSet;
	const visible = (n: GNode) => ui.layers.has(n.kind);
	const nodeAlpha = (n: GNode) => {
		let a = 1;
		const st = stateFor(g, n, ui.year, ui.metric);
		if (st === "off") a = 0.22;
		if (traced) a = traced.has(n.id) ? 1 : 0.14;
		else if (focus && !near.has(n.id)) a = Math.min(a, 0.2);
		return a;
	};

	// links
	for (const e of g.edges) {
		const a = g.byId.get(e.a);
		const b = g.byId.get(e.b);
		if (!a || !b || !visible(a) || !visible(b)) continue;
		const both = Math.min(nodeAlpha(a), nodeAlpha(b));
		const tracedEdge = !!traced && traced.has(a.id) && traced.has(b.id);
		const active = focus ? a.id === focus || b.id === focus : false;
		ctx.globalAlpha = tracedEdge ? 0.95 : traced ? 0.04 : focus && !active ? 0.06 : e.kind === "conflict" ? Math.max(0.45, both) : Math.max(0.06, both * 0.55);
		ctx.beginPath();
		ctx.moveTo(a.x, a.y);
		ctx.lineTo(b.x, b.y);
		if (e.kind === "conflict") {
			ctx.strokeStyle = c.bad;
			ctx.lineWidth = (ui.selectedEdge === e.id ? 4 : 2.4) / Math.sqrt(v.k);
			ctx.setLineDash([]);
		} else {
			ctx.strokeStyle = tracedEdge || active ? c.accent : c.line3;
			ctx.lineWidth = (tracedEdge ? 2.6 : active ? 1.8 : 0.8 + Math.min(1.6, Math.log2(1 + e.w) * 0.3)) / Math.sqrt(v.k);
			ctx.setLineDash(e.kind === "about" ? [5, 4] : []);
		}
		ctx.stroke();
		ctx.setLineDash([]);
	}

	// nodes
	const order = [...g.nodes].sort((p, q) => (traced ? Number(traced.has(p.id)) - Number(traced.has(q.id)) : 0));
	for (const n of order) {
		if (!visible(n)) continue;
		ctx.globalAlpha = nodeAlpha(n);
		const st = stateFor(g, n, ui.year, ui.metric);
		const isSel = ui.selected === n.id;
		const isTrace = !!traced && traced.has(n.id);
		if (isTrace || isSel) {
			ctx.beginPath();
			ctx.arc(n.x, n.y, n.r + 9, 0, Math.PI * 2);
			ctx.fillStyle = c.accent;
			ctx.globalAlpha = isTrace ? 0.2 : 0.14;
			ctx.fill();
			ctx.globalAlpha = nodeAlpha(n);
		}
		shape(ctx, n, c, st, isSel || isTrace);
		const showLabel = v.k >= 0.75 || n.id === focus || isSel || isTrace || n.kind === "document" || n.kind === "topic";
		if (showLabel && nodeAlpha(n) > 0.3) {
			ctx.globalAlpha = Math.max(nodeAlpha(n), 0.5) * (nodeAlpha(n) > 0.3 ? 1 : 0);
			ctx.font = `${n.kind === "period" ? 10 : 11.5}px "Geist", system-ui, sans-serif`;
			ctx.textAlign = "center";
			ctx.textBaseline = "top";
			ctx.fillStyle = n.id === focus || isSel ? c.ink : c.ink2;
			ctx.fillText(n.label, n.x, n.y + n.r + 5);
		}
	}
	ctx.restore();
	ctx.globalAlpha = 1;
}

function shape(ctx: CanvasRenderingContext2D, n: GNode, c: Colors, st: "normal" | "gap" | "off", emphasised: boolean) {
	const { x, y, r } = n;
	ctx.lineWidth = emphasised ? 2.4 : 1.6;
	ctx.setLineDash([]);
	switch (n.kind) {
		case "document": {
			const s = r * 1.55;
			roundRect(ctx, x - s / 2, y - s / 2, s, s, 6);
			ctx.fillStyle = c.surface;
			ctx.fill();
			ctx.strokeStyle = emphasised ? c.accent : c.ink3;
			ctx.stroke();
			ctx.fillStyle = c.ink3;
			for (let i = 0; i < 3; i += 1) ctx.fillRect(x - s * 0.28, y - s * 0.22 + i * s * 0.22, i === 2 ? s * 0.32 : s * 0.56, 1.8);
			break;
		}
		case "entity": {
			ctx.beginPath();
			ctx.arc(x, y, r, 0, Math.PI * 2);
			if (st === "gap") {
				ctx.fillStyle = c.surface;
				ctx.fill();
				ctx.strokeStyle = c.bad;
				ctx.setLineDash([4, 3]);
				ctx.lineWidth = 2;
				ctx.stroke();
				ctx.setLineDash([]);
			} else {
				ctx.globalAlpha *= 0.9;
				ctx.fillStyle = c.accent;
				ctx.fill();
				ctx.globalAlpha /= 0.9;
				ctx.strokeStyle = c.accent;
				ctx.stroke();
			}
			break;
		}
		case "metric": {
			ctx.beginPath();
			ctx.moveTo(x, y - r);
			ctx.lineTo(x + r, y);
			ctx.lineTo(x, y + r);
			ctx.lineTo(x - r, y);
			ctx.closePath();
			ctx.fillStyle = c.ink2;
			ctx.fill();
			ctx.strokeStyle = emphasised ? c.accent : c.ink2;
			ctx.stroke();
			break;
		}
		case "period": {
			roundRect(ctx, x - r * 1.45, y - r * 0.8, r * 2.9, r * 1.6, r * 0.8);
			ctx.fillStyle = c.surface2;
			ctx.fill();
			ctx.strokeStyle = emphasised ? c.accent : c.line3;
			ctx.lineWidth = 1.2;
			ctx.stroke();
			break;
		}
		case "topic": {
			ctx.beginPath();
			ctx.arc(x, y, r, 0, Math.PI * 2);
			ctx.fillStyle = c.surface;
			ctx.fill();
			ctx.strokeStyle = emphasised ? c.accent : c.ink3;
			ctx.setLineDash([4, 3]);
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.fillStyle = c.ink3;
			ctx.beginPath();
			ctx.arc(x, y, 2.6, 0, Math.PI * 2);
			ctx.fill();
			break;
		}
	}
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

// ── the side panel ──────────────────────────────────────────────────────────

const LABEL: React.CSSProperties = { color: "var(--label-tertiary)", fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" };
const KIND_NAME: Record<NodeKind, string> = { document: "Document", entity: "Entity", metric: "Measure", period: "Financial year", topic: "Topic" };

function PanelHead({ node, onClose }: { node: GNode; onClose: () => void }) {
	return (
		<div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 12 }}>
			<div style={{ flex: 1, minWidth: 0 }}>
				<div style={LABEL}>{KIND_NAME[node.kind]}</div>
				<div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.25, marginTop: 3, overflowWrap: "anywhere" }}>{node.kind === "entity" ? entityName(String(node.ref)) : node.label}</div>
				<div style={{ fontSize: 12, color: "var(--label-secondary)", marginTop: 2, overflowWrap: "anywhere" }}>{node.kind === "entity" ? node.label : node.sub}</div>
			</div>
			<button onClick={onClose} aria-label="Close" style={{ color: "var(--label-secondary)", fontSize: 12, padding: "2px 4px" }}>Close</button>
		</div>
	);
}

function Chip({ node, onSelect }: { node: GNode; onSelect: (id: string) => void }) {
	return (
		<button onClick={() => onSelect(node.id)} style={{ padding: "3px 9px", borderRadius: 999, border: "1px solid var(--border-l2)", background: "var(--bg-layer-2)", fontSize: 12 }}>
			{node.label}
		</button>
	);
}

function NodePanel({ graph, node, year, metric, onSelect, onClose, onAsk }: { graph: Graph; node: GNode; year: string; metric: string; onSelect: (id: string) => void; onClose: () => void; onAsk: (q: string) => void }) {
	const related = (kind: NodeKind) =>
		graph.edges
			.filter((e) => e.kind !== "conflict" && (e.a === node.id || e.b === node.id))
			.map((e) => graph.byId.get(e.a === node.id ? e.b : e.a))
			.filter((n): n is GNode => !!n && n.kind === kind);
	const question = questionFor(node);
	const conflicts = graph.conflicts.filter((c) => (node.kind === "document" ? c.a.documentId === node.ref || c.b.documentId === node.ref : node.kind === "entity" ? c.entity === node.ref : node.kind === "metric" ? c.metric === node.ref : node.kind === "period" ? c.period === node.ref : false));
	const state = stateFor(graph, node, year, metric);
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
			<PanelHead node={node} onClose={onClose} />
			{state === "gap" && (
				<div style={{ fontSize: 12.5, lineHeight: 1.5, padding: "8px 10px", borderRadius: 8, background: "var(--warn-tertiary)", color: "var(--warn-label)", border: "1px solid var(--warn-primary)" }}>
					No {metricName(metric).toLowerCase()} figure for {year}, though {node.label} has figures for other years.
				</div>
			)}
			{node.kind === "entity" && <EntityBody node={node} metric={metric} />}
			{node.kind === "document" && (
				<>
					<div style={{ fontSize: 12.5, color: "var(--label-secondary)" }}>{node.facts} facts read from this document.</div>
					<button onClick={() => openDocument(Number(node.ref), node.sub)} style={primary}>Open the source</button>
				</>
			)}
			{node.kind === "topic" && <TopicBody node={node} />}
			{node.kind === "metric" && <div style={{ fontSize: 12.5, color: "var(--label-secondary)" }}>{node.facts} facts across {related("entity").length} entities and {related("document").length} documents.</div>}
			{node.kind === "period" && <div style={{ fontSize: 12.5, color: "var(--label-secondary)" }}>{node.facts} facts are for this year, from {related("document").length} documents.</div>}

			{conflicts.length > 0 && (
				<div>
					<div style={LABEL}>Conflicts ({conflicts.length})</div>
					<div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
						{conflicts.slice(0, 6).map((c, i) => (
							<ConflictLine key={i} c={c} />
						))}
					</div>
				</div>
			)}

			{node.kind !== "document" && related("document").length > 0 && (
				<div>
					<div style={LABEL}>Stated in</div>
					<div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
						{related("document").map((d) => (
							<Chip key={d.id} node={d} onSelect={onSelect} />
						))}
					</div>
				</div>
			)}
			{node.kind === "document" && (
				<>
					{(["entity", "metric", "period", "topic"] as NodeKind[]).map((k) => {
						const list = related(k);
						return list.length === 0 ? null : (
							<div key={k}>
								<div style={LABEL}>{k === "entity" ? "Entities" : k === "metric" ? "Measures" : k === "period" ? "Years" : "Topics"}</div>
								<div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
									{list.map((n) => (
										<Chip key={n.id} node={n} onSelect={onSelect} />
									))}
								</div>
							</div>
						);
					})}
				</>
			)}
			{node.kind === "topic" && documentsOf(graph, node.id).length > 0 && (
				<div>
					<div style={LABEL}>Drawn from</div>
					<div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
						{documentsOf(graph, node.id).map((d) => (
							<Chip key={d.id} node={d} onSelect={onSelect} />
						))}
					</div>
				</div>
			)}
			{question && (
				<button onClick={() => onAsk(question)} style={primary} title={question}>
					Ask about this
					<span style={{ display: "block", fontWeight: 400, fontSize: 11.5, opacity: 0.85, marginTop: 2 }}>{question}</span>
				</button>
			)}
		</div>
	);
}

const primary: React.CSSProperties = { padding: "9px 12px", borderRadius: 8, background: "var(--accent)", color: "var(--accent-label)", fontWeight: 600, fontSize: 13, textAlign: "left" };

function EntityBody({ node, metric }: { node: GNode; metric: string }) {
	const metrics = entityMetrics(String(node.ref));
	const [m, setM] = useState(metrics.includes(metric) ? metric : (metrics[0] ?? metric));
	useEffect(() => setM(metrics.includes(metric) ? metric : (metrics[0] ?? metric)), [node.id, metric]);
	const points = trend(String(node.ref), m);
	const values = points.filter((p) => p.fact).map((p) => p.fact!.value);
	if (values.length === 0) return <div style={{ fontSize: 12.5, color: "var(--label-secondary)" }}>No figures for this measure.</div>;
	const max = Math.max(...values);
	const min = Math.min(...values);
	const W = 290;
	const H = 92;
	const x = (i: number) => 10 + (i / Math.max(1, points.length - 1)) * (W - 20);
	const y = (val: number) => H - 14 - ((val - min) / (max - min || 1)) * (H - 34);
	const segments: Array<Array<[number, number]>> = [];
	let cur: Array<[number, number]> = [];
	points.forEach((p, i) => {
		if (p.fact) cur.push([x(i), y(p.fact.value)]);
		else if (cur.length > 0) {
			segments.push(cur);
			cur = [];
		}
	});
	if (cur.length > 0) segments.push(cur);
	return (
		<div>
			<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
				<div style={LABEL}>Across the years</div>
				<span style={{ flex: 1 }} />
				{metrics.length > 1 && (
					<select value={m} onChange={(e) => setM(e.target.value)} style={{ border: "1px solid var(--border-l2)", borderRadius: 6, background: "var(--bg-layer-1)", fontSize: 11.5, padding: "2px 4px" }}>
						{metrics.map((k) => (
							<option key={k} value={k}>{metricName(k)}</option>
						))}
					</select>
				)}
			</div>
			<svg viewBox={`0 0 ${W} ${H + 12}`} style={{ width: "100%", height: "auto", overflow: "visible" }} role="img" aria-label="Trend">
				{segments.map((seg, i) => (
					<polyline key={i} points={seg.map(([px, py]) => `${px},${py}`).join(" ")} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
				))}
				{points.map((p, i) =>
					p.fact ? (
						<g key={p.period}>
							<circle cx={x(i)} cy={y(p.fact.value)} r="3.6" fill={p.fact.is_provisional ? "var(--bg-layer-1)" : "var(--accent)"} stroke={p.fact.status === "flagged" ? "var(--error-primary)" : "var(--accent)"} strokeWidth="1.8">
								<title>{`${p.period}: ${p.fact.value}${p.fact.is_provisional ? " (provisional)" : ""} · ${p.fact.status}`}</title>
							</circle>
						</g>
					) : (
						<g key={p.period}>
							<line x1={x(i)} x2={x(i)} y1={H - 14} y2={H - 6} stroke="var(--error-primary)" strokeWidth="1.6" strokeDasharray="2 2" />
							<title>{`${p.period}: no figure`}</title>
						</g>
					),
				)}
				{points.map((p, i) => (i % 2 === 0 || points.length < 7 ? <text key={p.period} x={x(i)} y={H + 8} textAnchor="middle" fontSize="8.5" fill="var(--label-tertiary)">{shortPeriod(p.period).replace("FY", "")}</text> : null))}
			</svg>
			<div style={{ fontSize: 11, color: "var(--label-tertiary)", marginTop: 4, lineHeight: 1.45 }}>Hollow dot: provisional. Red ring: flagged by a check. Red tick: the library has no figure for that year.</div>
		</div>
	);
}

function TopicBody({ node }: { node: GNode }) {
	const t = useMemo(() => buildTopic(node), [node]);
	if (!t) return null;
	return (
		<div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
			<div style={{ color: "var(--label-secondary)", marginBottom: 6 }}>{t.count} passages. Keywords:</div>
			<div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
				{t.keywords.slice(0, 8).map((k) => (
					<span key={k} style={{ padding: "2px 8px", borderRadius: 999, background: "var(--bg-layer-3)", fontSize: 12 }}>{k}</span>
				))}
			</div>
			{t.examples[0] && <div style={{ marginTop: 10, color: "var(--label-secondary)" }}>“{t.examples[0].snippet.slice(0, 200)}…”</div>}
		</div>
	);
}

import { library } from "../../engine";
function buildTopic(node: GNode) {
	const t = library.topics().topics.find((x) => x.id === node.ref);
	return t ? { count: t.count, keywords: t.keywords, examples: t.examples } : null;
}

function ConflictLine({ c }: { c: Conflict }) {
	return (
		<div style={{ fontSize: 12, lineHeight: 1.45, padding: "7px 9px", borderRadius: 8, border: "1px solid var(--border-l2)", background: "var(--bg-layer-2)" }}>
			<strong>{c.entity.replace("STATE:", "")}</strong> · {metricName(c.metric).toLowerCase()} · {c.period}
			<div style={{ display: "flex", gap: 10, marginTop: 3 }}>
				<ConflictSide s={c.a} />
				<ConflictSide s={c.b} />
			</div>
		</div>
	);
}

function ConflictSide({ s }: { s: Conflict["a"] }) {
	return (
		<button onClick={() => openDocument(s.documentId, s.filename)} title="Open this source" style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
			<span className="tabular" style={{ fontWeight: 600, color: "var(--error-primary)" }}>{s.value}</span>
			{s.provisional && <span style={{ color: "var(--warn-label)", fontSize: 10.5 }}> provisional</span>}
			<span style={{ display: "block", color: "var(--label-secondary)", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: "underline", textDecorationColor: "var(--border-l3)" }}>{s.filename.replace(/^sample-/, "")}</span>
		</button>
	);
}

function ConflictPanel({ edge, graph, onClose }: { edge: GEdge; graph: Graph; onClose: () => void }) {
	const a = graph.byId.get(edge.a);
	const b = graph.byId.get(edge.b);
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
			<div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
				<div style={{ flex: 1 }}>
					<div style={LABEL}>Conflict</div>
					<div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3, marginTop: 3 }}>{a?.label} and {b?.label} disagree</div>
					<div style={{ fontSize: 12, color: "var(--label-secondary)", marginTop: 2 }}>
						<StateDot state="error" size={7} style={{ marginRight: 6 }} />
						{edge.conflicts?.length} figure{edge.conflicts?.length === 1 ? "" : "s"}. Stratum reports the higher-precedence, final value and raises this as a review note in PQ drafts.
					</div>
				</div>
				<button onClick={onClose} style={{ color: "var(--label-secondary)", fontSize: 12 }}>Close</button>
			</div>
			{edge.conflicts?.map((c, i) => (
				<ConflictLine key={i} c={c} />
			))}
		</div>
	);
}

