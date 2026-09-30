import { useEffect, useRef, useState } from "react";
import { displayFor } from "../fleet";
import { useStratum } from "../store";
import { Pill, StateDot } from "./ui";

const SECONDARY = { color: "var(--label-secondary)" } as const;

export function RoutingChip({ locked }: { locked: boolean }) {
	const decision = useStratum((s) => s.current().routing);
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);
	const selected = decision?.selected ?? null;
	const canOpen = decision !== null && !locked;

	useEffect(() => {
		if (!open) return;
		const onDown = (e: PointerEvent) => {
			if (!ref.current?.contains(e.target as Node)) setOpen(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		window.addEventListener("pointerdown", onDown);
		window.addEventListener("keydown", onKey);
		return () => {
			window.removeEventListener("pointerdown", onDown);
			window.removeEventListener("keydown", onKey);
		};
	}, [open]);

	const title = selected
		? `The router picked ${displayFor(selected)} for this task type. Open for the score per model.`
		: "The router picks a model from its classifier score once the first turn runs.";

	return (
		<div ref={ref} data-tour="chip" style={{ position: "relative" }}>
			<Pill onClick={canOpen ? () => setOpen((v) => !v) : undefined} active={open} title={title} disabled={locked} aria-haspopup="menu" aria-expanded={open}>
				{selected && <StateDot state="done" size={8} />}
				{selected ? displayFor(selected) : "Auto-routing"}
			</Pill>
			{open && decision && (
				<div
					role="menu"
					className="fade-up"
					style={{
						position: "absolute",
						bottom: "calc(100% + 8px)",
						right: 0,
						width: 320,
						background: "var(--bg-layer-1)",
						border: "1px solid var(--border-l2)",
						borderRadius: 10,
						boxShadow: "var(--shadow-lv2)",
						padding: "8px 0",
						fontSize: 12.5,
						zIndex: 50,
					}}
				>
					<div style={{ padding: "6px 14px 2px", ...SECONDARY }}>Task type — classified by the router (keyword rules, no model call)</div>
					<div style={{ padding: "4px 14px 8px" }}>
						{decision.taskType}
						{(decision.tied || decision.allZero) && (
							<span style={SECONDARY}>
								{" "}
								({[decision.tied ? "score tie — broken by fleet order" : null, decision.allZero ? "no strong match" : null].filter(Boolean).join("; ")})
							</span>
						)}
					</div>
					<div style={{ borderTop: "1px solid var(--border-l1)", margin: "4px 0" }} />
					<div style={{ padding: "6px 14px 2px", ...SECONDARY }}>Models — score per member</div>
					{decision.scored.length === 0 && <div style={{ padding: "4px 14px 8px" }}>No model was eligible to score</div>}
					{decision.scored.map((member) => (
						<div key={member.name} title={`${member.name} — score ${member.score}`} style={{ padding: "5px 14px" }}>
							<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
								<span style={{ flex: 1, fontWeight: 500 }}>{displayFor(member.name)}</span>
								<span className="tabular" style={SECONDARY}>
									score {member.score}
								</span>
								<span aria-hidden style={{ width: 14, textAlign: "center", color: "var(--label-primary)" }}>
									{member.name === selected ? "✓" : ""}
								</span>
							</div>
							<div style={{ ...SECONDARY, fontSize: 11.5, marginTop: 2 }}>
								{member.matched.length > 0
									? member.matched.map((hit) => `${hit.capability} +${hit.points}`).join(" · ")
									: decision.allZero
										? "no scored capability — first eligible member selected"
										: "no scored capability"}
							</div>
						</div>
					))}
					{decision.excluded.length > 0 && (
						<>
							<div style={{ borderTop: "1px solid var(--border-l1)", margin: "4px 0" }} />
							<div style={{ padding: "6px 14px 2px", ...SECONDARY }}>Filtered out before scoring</div>
							{decision.excluded.map((member) => (
								<div key={member.name} title={member.reason.detail || member.reason.code || ""} style={{ padding: "5px 14px" }}>
									<div style={{ fontWeight: 500 }}>{displayFor(member.name)}</div>
									<div style={{ ...SECONDARY, fontSize: 11.5, marginTop: 2, overflowWrap: "anywhere" }}>{member.reason.detail || member.reason.code || "excluded before scoring"}</div>
								</div>
							))}
						</>
					)}
				</div>
			)}
		</div>
	);
}
