import { useEffect, useRef, useState, type ReactNode } from "react";
import { displayFor } from "../fleet";
import { DRAWER_MAX_WIDTH, DRAWER_MIN_WIDTH, egressSnapshot, useStratum, type SessionEvent } from "../store";
import { GhostButton, SECTION_LABEL, StateDot } from "./ui";

type Entry = SessionEvent & { kind: string };

function denialClock(time: number) {
	return new Date(time).toLocaleTimeString();
}
function denialStamp(time: number) {
	return new Date(time).toISOString();
}

/** The audit record's copy, verbatim from the prototype. */
export function describeEntry(entry: Entry): { headline: string; detail: string } {
	const tool = String(entry.data.tool ?? "an unrecorded tool");
	const target = String(entry.data.target ?? "an unrecorded target");
	switch (entry.kind) {
		case "seal":
			return entry.data.sealed === false
				? { headline: "Seal opened", detail: "Stratum stopped denying outbound calls. Recorded here because the officer did it." }
				: { headline: "Seal closed", detail: "Outbound calls are denied again." };
		case "permitted":
			return { headline: "Permitted — the seal was open", detail: `${tool} was allowed to reach ${target}. Nothing in this application stood in its way.` };
		case "escaped":
			return entry.data.reached === true
				? { headline: "Reached the internet", detail: `${target} answered. The seal was open and nothing else stopped this call.` }
				: { headline: "Left the application — stopped outside it", detail: `${target} was attempted and nothing came back. ${entry.data.detail || "No response."} Whatever refused this was not Stratum.` };
		default:
			return { headline: "Denied", detail: `${tool} tried to reach ${target}. Stratum denied it before it ran.` };
	}
}

export function SovereigntyDrawer() {
	const drawerOpen = useStratum((s) => s.drawerOpen);
	const setDrawerOpen = useStratum((s) => s.setDrawerOpen);
	const width = useStratum((s) => s.drawerWidth);
	const setWidth = useStratum((s) => s.setDrawerWidth);
	const sealed = useStratum((s) => s.sealed);
	const sealBusy = useStratum((s) => s.sealBusy);
	const requestSeal = useStratum((s) => s.requestSeal);
	const session = useStratum((s) => s.current());
	const snapshot = egressSnapshot(session);
	const listRef = useRef<HTMLDivElement>(null);
	const [residencyOpen, setResidencyOpen] = useState(false);
	const [planeOpen, setPlaneOpen] = useState(true);

	useEffect(() => {
		if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
	}, [snapshot.entries.length, drawerOpen]);

	if (!drawerOpen) return null;
	const sealOpen = !sealed;
	const routing = session.routing;

	return (
		<aside
			aria-label="Egress monitor"
			className="fade-in"
			style={{
				position: "absolute",
				top: 0,
				right: 0,
				bottom: 0,
				width,
				display: "flex",
				flexDirection: "column",
				background: "var(--bg-layer-1)",
				borderLeft: "1px solid var(--border-l2)",
				fontSize: 13,
				zIndex: 30,
			}}
		>
			<ResizeHandle width={width} onChange={setWidth} />
			<header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px 14px", borderBottom: "1px solid var(--border-l1)" }}>
				<span style={{ fontWeight: 600 }}>Sovereignty</span>
				<GhostButton onClick={() => setDrawerOpen(false)} ariaLabel="Close the egress monitor">
					Close
				</GhostButton>
			</header>
			<div className="scroll" style={{ flex: "1 1 auto", overflowY: "auto" }}>
				<div style={{ padding: "16px 18px", display: "flex", gap: 14, alignItems: "flex-start" }}>
					<div style={{ flex: 1 }}>
						<div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 600, color: sealOpen ? "var(--warn-label)" : undefined }}>
							<StateDot state={sealOpen ? "warning" : "done"} size={9} />
							{sealOpen ? "Seal OPEN" : "Sealed"}
						</div>
						<div style={{ fontSize: 12, lineHeight: 1.45, color: "var(--label-secondary)", marginTop: 6 }}>
							{sealOpen
								? "Outbound calls are not being denied by Stratum. Every call that runs is recorded below, and restarting the workbench closes the seal again."
								: "Outbound calls are denied before they run. Opening the seal is recorded here, and a restart closes it again."}
						</div>
					</div>
					<SealControl open={sealOpen} busy={sealBusy} onChange={(open) => requestSeal(open)} />
				</div>

				<div style={{ borderTop: "1px solid var(--border-l1)", padding: "14px 18px 12px" }}>
					<div style={SECTION_LABEL}>Egress monitor</div>
					<div style={{ display: "flex", gap: 26, marginTop: 12 }}>
						<Stat value={snapshot.count} label="denied this session" />
						<Stat value={snapshot.permitted} label="let through" warn={snapshot.permitted > 0} />
					</div>
					<div ref={listRef} role="list" aria-label="Egress record — oldest first" className="scroll" style={{ maxHeight: "40vh", overflowY: "auto", marginTop: 10 }}>
						{snapshot.entries.map((entry) => {
							const { headline, detail } = describeEntry(entry);
							const denied = entry.kind === "denied";
							return (
								<div key={`bf-egress-line:${entry.seq}`} role="listitem" title={`${denialStamp(entry.time)} — ${headline}. ${detail}`} style={{ padding: "8px 0", borderBottom: "1px solid var(--border-l1)" }}>
									<div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
										<span className="tabular" style={{ color: "var(--label-tertiary)", fontSize: 11.5 }}>{denialClock(entry.time)}</span>
										<span style={{ fontSize: 12.5, fontWeight: denied ? 500 : 400 }}>{headline}</span>
									</div>
									<div style={{ color: "var(--label-secondary)", fontSize: 11.5, lineHeight: 1.45, overflowWrap: "anywhere" }}>{detail}</div>
								</div>
							);
						})}
					</div>
					<div style={{ fontSize: 11.5, color: "var(--label-tertiary)", lineHeight: 1.45, marginTop: 10 }}>Both figures are counts of events this session's log recorded, not printed labels.</div>
				</div>

				<Disclosure label="Residency" summary="not applicable" open={residencyOpen} onToggle={() => setResidencyOpen((v) => !v)}>
					<DetailLine>Nothing is resident on this workstation. The models of this build are hosted, so there is no GPU memory to report and no eviction to watch.</DetailLine>
					<DetailLine>The local build reports llama-swap's own <code>/running</code> here: Qwen3-4B for text, Qwen3-VL-2B for pages, one at a time on a 4 GB card.</DetailLine>
				</Disclosure>
				<Disclosure label="Model plane" summary="hosted — Groq API" open={planeOpen} onToggle={() => setPlaneOpen((v) => !v)}>
					<DetailLine>
						This demo build answers through the Groq API (open-weight GPT-OSS-20B for text, Qwen3.8-27B for page images), so every prompt leaves this page. The seal governs Stratum's tools, not the model plane. The real product runs local models on the officer's machine and the seal covers everything.
					</DetailLine>
					{routing ? (
						<DetailLine>
							Routed as {routing.taskType} {"→"} {routing.selected ? displayFor(routing.selected) : "no member"}
							{routing.selected ? ` (${routing.selected})` : ""}
						</DetailLine>
					) : (
						<DetailLine>Nothing routed yet.</DetailLine>
					)}
				</Disclosure>
			</div>
			<footer style={{ padding: "12px 18px", borderTop: "1px solid var(--border-l1)" }}>
				<GhostButton onClick={() => exportLedger(session.id, snapshot.entries)} disabled={snapshot.entries.length === 0}>
					Export egress record
				</GhostButton>
			</footer>
		</aside>
	);
}

function Stat({ value, label, warn }: { value: number; label: string; warn?: boolean }) {
	return (
		<div>
			<div className="tabular" style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1, color: warn ? "var(--warn-label)" : value === 0 && label === "let through" ? "var(--label-tertiary)" : undefined }}>
				{value}
			</div>
			<div style={{ fontSize: 11.5, color: "var(--label-secondary)", marginTop: 4 }}>{label}</div>
		</div>
	);
}

function SealControl({ open, busy, onChange }: { open: boolean; busy: boolean; onChange: (open: boolean) => void }) {
	const toggle = () => {
		if (!busy) onChange(!open);
	};
	return (
		<button
			role="switch"
			aria-checked={open}
			aria-label="Network seal"
			title={open ? "Close the seal. Stratum goes back to denying every outbound call." : "Open the seal. This workbench will be allowed to make real outbound calls, and each one is recorded."}
			disabled={busy}
			onClick={toggle}
			onKeyDown={(e) => {
				if (e.key === " " || e.key === "Enter") {
					e.preventDefault();
					toggle();
				}
			}}
			style={{
				position: "relative",
				width: 38,
				height: 22,
				borderRadius: 11,
				border: "1px solid var(--border-l2)",
				background: open ? "var(--label-primary)" : "var(--bg-layer-2)",
				opacity: busy ? 0.5 : 1,
				flex: "0 0 auto",
				marginTop: 2,
			}}
		>
			<span aria-hidden style={{ position: "absolute", top: 2, left: open ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: open ? "var(--bg-layer-1)" : "var(--label-secondary)", transition: "left 120ms ease" }} />
		</button>
	);
}

function Disclosure({ label, summary, open, onToggle, children }: { label: string; summary?: string | null; open: boolean; onToggle: () => void; children: ReactNode }) {
	return (
		<div style={{ borderTop: "1px solid var(--border-l1)" }}>
			<button onClick={onToggle} aria-expanded={open} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "13px 18px", fontSize: 13, textAlign: "left" }}>
				<span aria-hidden style={{ color: "var(--label-tertiary)", fontSize: 10, transform: open ? "rotate(90deg)" : "none", transition: "transform 120ms ease", display: "inline-block" }}>
					{"▸"}
				</span>
				<span style={{ flex: 1 }}>{label}</span>
				{summary != null && <span style={{ color: "var(--label-secondary)", fontSize: 12 }}>{summary}</span>}
			</button>
			{open && <div style={{ padding: "0 18px 14px", display: "flex", flexDirection: "column", gap: 5 }}>{children}</div>}
		</div>
	);
}

function DetailLine({ children }: { children: ReactNode }) {
	return <div style={{ color: "var(--label-secondary)", fontSize: 12, lineHeight: 1.5 }}>{children}</div>;
}

function ResizeHandle({ width, onChange }: { width: number; onChange: (px: number) => void }) {
	return (
		<div
			role="separator"
			aria-orientation="vertical"
			aria-label="Resize the egress monitor"
			aria-valuenow={width}
			aria-valuemin={DRAWER_MIN_WIDTH}
			aria-valuemax={DRAWER_MAX_WIDTH}
			tabIndex={0}
			onPointerDown={(e) => {
				const el = e.currentTarget;
				el.setPointerCapture(e.pointerId);
				const host = el.parentElement!.parentElement!;
				const move = (ev: PointerEvent) => onChange(host.getBoundingClientRect().right - ev.clientX);
				const up = () => {
					window.removeEventListener("pointermove", move);
					window.removeEventListener("pointerup", up);
				};
				window.addEventListener("pointermove", move);
				window.addEventListener("pointerup", up);
			}}
			onKeyDown={(e) => {
				if (e.key === "ArrowLeft") onChange(width + 16);
				if (e.key === "ArrowRight") onChange(width - 16);
			}}
			style={{ position: "absolute", left: -3, top: 0, bottom: 0, width: 7, cursor: "col-resize", touchAction: "none", zIndex: 1 }}
		/>
	);
}

function exportLedger(sessionId: string, entries: Entry[]) {
	const stamped = new Date();
	const lines = [
		"Stratum — egress record",
		`Session: ${sessionId}`,
		`Exported: ${stamped.toISOString()}`,
		"Model plane: hosted — Groq API (demo build)",
		`Events: ${entries.length}`,
		"",
		"Every line below is one event this session's log recorded. Denials are",
		"refusals Stratum made before the call ran; anything else is stated as",
		"what it was. Nothing here is derived from a counter.",
		"",
	];
	for (const entry of entries) {
		const { headline, detail } = describeEntry(entry);
		lines.push(`${denialStamp(entry.time)}  [${entry.kind}]  ${headline}`);
		lines.push(`    ${detail}`);
	}
	const blob = new Blob([lines.join("\n") + "\n"], { type: "text/plain;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = `faraday-egress-${stamped.toISOString().slice(0, 19).replace(/[:T]/g, "")}.txt`;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
