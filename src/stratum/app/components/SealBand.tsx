import { useEffect, useState } from "react";
import { useStratum } from "../store";
import { GhostButton, StateDot } from "./ui";

const NOTICE_MS = 8000;
const NOTICE_FRESH_MS = 15000;

const bandStyle = {
	pointerEvents: "auto" as const,
	maxWidth: "min(680px, calc(100% - 32px))",
	padding: "8px 10px 8px 14px",
	borderRadius: 12,
	background: "var(--bg-layer-1)",
	border: "1px solid var(--border-l2)",
	boxShadow: "var(--shadow-lv2)",
	fontSize: 13,
	display: "flex",
	alignItems: "center",
	gap: 10,
};

/** The open-seal band (cannot be dismissed) and the transient denial notice, both at the top of the workbench. */
export function Overlays() {
	const sealed = useStratum((s) => s.sealed);
	const sealBusy = useStratum((s) => s.sealBusy);
	const requestSeal = useStratum((s) => s.requestSeal);
	const setDrawerOpen = useStratum((s) => s.setDrawerOpen);
	const lastDenial = useStratum((s) => s.lastDenial);
	const [notice, setNotice] = useState<typeof lastDenial>(null);

	useEffect(() => {
		if (!lastDenial) return;
		if (Date.now() - lastDenial.at > NOTICE_FRESH_MS) return;
		setNotice(lastDenial);
		const t = setTimeout(() => setNotice(null), NOTICE_MS);
		return () => clearTimeout(t);
	}, [lastDenial]);

	return (
		<div style={{ position: "absolute", top: 12, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, pointerEvents: "none", zIndex: 40 }}>
			{!sealed && (
				<section aria-label="The egress seal is open" className="fade-up" style={bandStyle}>
					<StateDot state="warning" size={10} />
					<span>
						<strong>The egress seal is open.</strong> Outbound calls are not being blocked by Stratum.
					</span>
					<GhostButton onClick={() => requestSeal(false)} disabled={sealBusy}>
						Close the seal
					</GhostButton>
				</section>
			)}
			{notice && (
				<section role="status" aria-label="An outbound call was denied" className="fade-up" style={bandStyle}>
					<StateDot state="error" size={10} />
					<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
						<strong>Outbound call denied.</strong>
						<span className="tabular" style={{ color: "var(--label-secondary)", marginLeft: 6 }}>
							{notice.tool} {"→"} {notice.target}
						</span>
					</span>
					<GhostButton
						onClick={() => {
							setNotice(null);
							setDrawerOpen(true);
						}}
					>
						Show
					</GhostButton>
				</section>
			)}
		</div>
	);
}
