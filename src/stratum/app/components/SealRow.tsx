import { useEffect, useRef, useState } from "react";
import { egressSnapshot, useStratum } from "../store";
import { StateDot } from "./ui";

/** True for 6 s after `value` rises within one scope; a scope change re-seats the baseline instead of flashing. */
function useRecentIncrease(value: number | null, scope: string) {
	const [fresh, setFresh] = useState(false);
	const ref = useRef<{ scope: string; value: number | null }>({ scope, value });
	useEffect(() => {
		const prev = ref.current;
		ref.current = { scope, value };
		if (prev.scope !== scope || value === null || prev.value === null) return;
		if (value > prev.value) {
			setFresh(true);
			const t = setTimeout(() => setFresh(false), 6000);
			return () => clearTimeout(t);
		}
	}, [value, scope]);
	return fresh;
}

export function SealRow() {
	const sealed = useStratum((s) => s.sealed);
	const toggleDrawer = useStratum((s) => s.toggleDrawer);
	const drawerOpen = useStratum((s) => s.drawerOpen);
	const session = useStratum((s) => s.current());
	const { count } = egressSnapshot(session);
	const fresh = useRecentIncrease(count, session.id);
	const [hot, setHot] = useState(false);
	const open = !sealed;

	const title = open
		? "Egress monitor: the seal is OPEN — Stratum is not denying outbound calls. Open it for the record and the control that closes the seal."
		: `Egress monitor: sealed, ${count} outbound attempt${count === 1 ? "" : "s"} denied and recorded this session. Open it for the record.`;

	return (
		<div style={{ borderTop: "1px solid var(--border-l1)", paddingTop: 8, marginTop: 4, width: "100%" }}>
			<button
				data-tour="seal"
				onClick={toggleDrawer}
				title={title}
				aria-label={title}
				aria-haspopup="dialog"
				aria-expanded={drawerOpen}
				onPointerEnter={() => setHot(true)}
				onPointerLeave={() => setHot(false)}
				onFocus={() => setHot(true)}
				onBlur={() => setHot(false)}
				style={{
					display: "flex",
					alignItems: "center",
					gap: 10,
					width: "100%",
					padding: "7px 10px",
					border: "1px solid",
					borderRadius: 8,
					background: open ? "var(--warn-tertiary)" : hot ? "var(--interactive-hover)" : "var(--bg-layer-2)",
					borderColor: open ? "var(--warn-primary)" : hot ? "var(--border-l3)" : "var(--border-l1)",
					transition: "background 120ms ease, border-color 120ms ease",
					textAlign: "left",
				}}
			>
				<StateDot state={open ? "warning" : "done"} size={8} />
				<span style={{ flex: 1, minWidth: 0 }}>
					<span style={{ display: "block", fontSize: 13, lineHeight: 1.25 }}>Egress monitor</span>
					<span style={{ display: "block", fontSize: 11.5, lineHeight: 1.25, color: open ? "var(--warn-label)" : "var(--label-tertiary)" }}>
						{open ? "OPEN" : "Sealed"}
						{" · "}
						<span className="tabular" style={{ color: fresh ? "var(--error-primary)" : undefined, fontWeight: fresh ? 600 : undefined, transition: "color 200ms ease" }}>
							{count} denied
						</span>
					</span>
				</span>
				<span aria-hidden style={{ color: "var(--label-tertiary)" }}>
					{"›"}
				</span>
			</button>
		</div>
	);
}
