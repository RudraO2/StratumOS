import { useEffect, useRef } from "react";
import type { AppProps } from "../../os/kernel/apps";
import { launch } from "../../os/kernel/launch";
import { library } from "../engine";
import { Hero, RingedMark, Wordmark } from "./components/Brand";
import { Composer, SuggestedPrompts } from "./components/Composer";
import { ImagePreview } from "./components/ImagePreview";
import { Overlays } from "./components/SealBand";
import { SealRow } from "./components/SealRow";
import { SovereigntyDrawer } from "./components/SovereigntyDrawer";
import { Tour, tourSeen } from "./components/Tour";
import { Transcript } from "./components/Transcript";
import { Pill, StateDot } from "./components/ui";
import { MapView } from "./graph/GraphView";
import { egressSnapshot, useStratum } from "./store";

const FOLDER = <path d="M1.5 4a1 1 0 0 1 1-1h3.2l1.5 1.5h6.3a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" strokeWidth="1.2" />;

export function Stratum({ args, nonce }: AppProps) {
	const rootRef = useRef<HTMLDivElement>(null);
	const setTourStep = useStratum((s) => s.setTourStep);
	useEffect(() => {
		// The Welcome window launches with { tour: true }; the tour is shown once per browser.
		if (args?.tour === true && !tourSeen()) {
			const t = setTimeout(() => setTourStep(0), 500);
			return () => clearTimeout(t);
		}
	}, [args?.tour, nonce, setTourStep]);
	const sessions = useStratum((s) => s.sessions);
	const currentId = useStratum((s) => s.currentId);
	const selectSession = useStratum((s) => s.selectSession);
	const newSession = useStratum((s) => s.newSession);
	const drawerOpen = useStratum((s) => s.drawerOpen);
	const drawerWidth = useStratum((s) => s.drawerWidth);
	const view = useStratum((s) => s.view);
	const setView = useStratum((s) => s.setView);
	const session = useStratum((s) => s.current());
	const onMap = view === "map";
	const hero = session.turns.length === 0;
	const egress = egressSnapshot(session);
	const summary = library.summary();

	return (
		<div ref={rootRef} style={{ position: "absolute", inset: 0, display: "flex", background: "var(--bg-layer-1)", color: "var(--label-primary)", fontSize: 13 }}>
			<aside style={{ width: 268, flex: "0 0 auto", borderRight: "1px solid var(--border-l1)", background: "var(--bg-layer-2)", display: "flex", flexDirection: "column", padding: 14 }}>
				<div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 2px 14px" }}>
					<RingedMark size={26} />
					<Wordmark />
				</div>
				<button
					onClick={() => {
						setView("ask");
						newSession();
					}}
					style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: 38, borderRadius: 8, background: "var(--bg-layer-3)", border: "1px solid var(--border-l1)", fontWeight: 600, fontSize: 13 }}
				>
					<span style={{ fontSize: 16, lineHeight: 1 }}>+</span> New session
				</button>
				<div role="tablist" aria-label="View" data-tour="views" style={{ display: "flex", gap: 2, padding: 3, marginTop: 12, borderRadius: 9, background: "var(--bg-layer-3)" }}>
					{([["ask", "Ask"], ["map", "Map"]] as const).map(([id, label]) => (
						<button
							key={id}
							role="tab"
							aria-selected={view === id}
							onClick={() => setView(id)}
							style={{ flex: 1, height: 28, borderRadius: 7, fontSize: 12.5, fontWeight: view === id ? 600 : 400, background: view === id ? "var(--bg-layer-1)" : "transparent", color: view === id ? "var(--label-primary)" : "var(--label-secondary)", boxShadow: view === id ? "0 1px 2px rgba(0,0,0,0.12)" : undefined }}
						>
							{label}
						</button>
					))}
				</div>
				<div style={{ color: "var(--label-secondary)", fontSize: 12, padding: "18px 4px 8px" }}>Sessions</div>
				<div className="scroll" style={{ flex: 1, overflowY: "auto" }}>
					{sessions.map((s) => (
						<button
							key={s.id}
							onClick={() => {
								setView("ask");
								selectSession(s.id);
							}}
							style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, width: "100%", padding: "7px 10px", borderRadius: 6, background: s.id === currentId ? "var(--selector)" : "transparent", textAlign: "left", fontSize: 13 }}
							onPointerEnter={(e) => (e.currentTarget.style.background = "var(--interactive-hover)")}
							onPointerLeave={(e) => (e.currentTarget.style.background = s.id === currentId ? "var(--selector)" : "transparent")}
						>
							<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
							<span style={{ color: "var(--label-tertiary)", fontSize: 11 }}>{ago(s.createdAt)}</span>
						</button>
					))}
				</div>
				<button
					data-tour="library"
					onClick={() => launch("library")}
					title="The sample library: documents, the facts read from them, topics and the measured metrics."
					style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 10px", border: "1px solid var(--border-l1)", borderRadius: 8, background: "var(--bg-layer-2)", textAlign: "left", marginBottom: 6 }}
					onPointerEnter={(e) => (e.currentTarget.style.background = "var(--interactive-hover)")}
					onPointerLeave={(e) => (e.currentTarget.style.background = "var(--bg-layer-2)")}
				>
					<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden style={{ color: "var(--accent)" }}>{FOLDER}</svg>
					<span style={{ flex: 1, minWidth: 0 }}>
						<span style={{ display: "block", fontSize: 13, lineHeight: 1.25 }}>Library</span>
						<span style={{ display: "block", fontSize: 11.5, lineHeight: 1.25, color: "var(--label-tertiary)" }}>
							{library.documents().length} documents · {summary.total} facts
						</span>
					</span>
					<span aria-hidden style={{ color: "var(--label-tertiary)" }}>{"›"}</span>
				</button>
				<SealRow />
				<button onClick={() => launch("settings")} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 6px 2px", fontSize: 13, color: "var(--label-primary)" }}>
					<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.2" /><path d="M8 1.5l1.3 1.1 1.7-.3.7 1.6 1.6.7-.3 1.7L14.5 8l-1.1 1.3.3 1.7-1.6.7-.7 1.6-1.7-.3L8 14.5l-1.3-1.1-1.7.3-.7-1.6-1.6-.7.3-1.7L1.5 8l1.1-1.3-.3-1.7 1.6-.7.7-1.6 1.7.3z" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" /></svg>
					Settings
				</button>
			</aside>

			<main style={{ flex: 1, minWidth: 0, position: "relative", display: "flex", flexDirection: "column", paddingRight: drawerOpen ? drawerWidth : 0, transition: "padding-right 120ms ease" }}>
				<Overlays />
				{(onMap || !hero) && (
					<header style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 18px", borderBottom: "1px solid var(--border-l1)" }}>
						<span style={{ fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{onMap ? "Library map" : session.title}</span>
						<ProviderPill />
						<Pill title="Outbound attempts denied and recorded this session, counted from the session log.">
							<StateDot state={egress.count > 0 ? "error" : "done"} size={8} />
							Egress {egress.count}
						</Pill>
					</header>
				)}
				{onMap ? (
					<MapView />
				) : hero ? (
					<div className="scroll" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22, padding: 24, overflowY: "auto" }}>
						<Hero />
						<div style={{ width: "100%", maxWidth: 780, display: "flex", alignItems: "center", gap: 14, fontSize: 14, color: "var(--label-primary)", paddingLeft: 6 }}>
							<span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
								<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>{FOLDER}</svg>
								Sample library
							</span>
							<span title="Task type, selected by the router. Stratum classifies the request; there is nothing here to set." style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
								<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M3 12.5c0-3 2.2-5.5 5-5.5s5 2.5 5 5.5M8 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
								Auto-routed
							</span>
							<span style={{ marginLeft: "auto" }} data-tour="provider">
								<ProviderPill />
							</span>
						</div>
						<Composer hero />
						<SuggestedPrompts />
					</div>
				) : (
					<>
						<Transcript turns={session.turns} />
						<div style={{ padding: "0 24px 16px" }}>
							<Composer hero={false} />
						</div>
					</>
				)}
				<SovereigntyDrawer />
				<ImagePreview />
			</main>
			<Tour rootRef={rootRef} />
		</div>
	);
}

function ProviderPill() {
	return (
		<Pill title="Stratum is answering from the hosted provider: open-weight models (GPT-OSS-20B for text, Qwen3.8-27B for page images) reached through the Groq API. This is the demo build; the product itself runs local models on the officer's machine, and says so up front.">
			<StateDot state="done" size={8} />
			Demo — hosted on Groq
		</Pill>
	);
}

function ago(at: number) {
	const s = Math.max(0, Math.round((Date.now() - at) / 1000));
	if (s < 60) return "now";
	if (s < 3600) return `${Math.round(s / 60)}min`;
	if (s < 86400) return `${Math.round(s / 3600)}h`;
	return `${Math.round(s / 86400)}d`;
}
