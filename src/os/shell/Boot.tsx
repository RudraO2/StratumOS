import { useEffect, useState } from "react";
import { useOS } from "../kernel/store";

export function Boot() {
	const setBooted = useOS((s) => s.setBooted);
	const [phase, setPhase] = useState(0);
	useEffect(() => {
		const t1 = setTimeout(() => setPhase(1), 900);
		const t2 = setTimeout(() => setBooted(true), 1700);
		return () => {
			clearTimeout(t1);
			clearTimeout(t2);
		};
	}, [setBooted]);
	return (
		<div style={{ position: "absolute", inset: 0, background: "#0b0c0f", color: "#fff", display: "grid", placeItems: "center" }}>
			<div className="fade-in" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
				<svg width="56" height="56" viewBox="0 0 20 20" aria-hidden>
					<rect x="2" y="2" width="7" height="7" rx="1" fill="#e2894f" />
					<rect x="11" y="2" width="7" height="7" rx="1" fill="#e2894f" />
					<rect x="2" y="11" width="7" height="7" rx="1" fill="#e2894f" />
					<rect x="11" y="11" width="7" height="7" rx="1" fill="#e2894f" />
				</svg>
				<div style={{ width: 28, height: 28, borderRadius: "50%", border: "3px solid rgba(255,255,255,0.25)", borderTopColor: "#fff", animation: "spin 900ms linear infinite" }} />
				<div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>{phase === 0 ? "CMPDI Workstation" : "Sealing the library…"}</div>
			</div>
			<style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
		</div>
	);
}
