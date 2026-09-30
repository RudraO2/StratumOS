import type { AppProps } from "../kernel/apps";
import { useOS } from "../kernel/store";

export function Settings(_: AppProps) {
	const { theme, setTheme } = useOS();
	return (
		<div style={{ display: "flex", height: "100%" }}>
			<nav style={{ width: 200, borderRight: "1px solid var(--border-l1)", padding: 12, background: "var(--bg-layer-2)", fontSize: 13 }}>
				<div style={{ fontWeight: 600, marginBottom: 8, padding: "4px 8px" }}>Settings</div>
				{["Personalization", "System", "About"].map((s, i) => (
					<div key={s} style={{ padding: "6px 8px", borderRadius: 4, background: i === 0 ? "var(--selector)" : "transparent", color: i === 0 ? "var(--label-primary)" : "var(--label-secondary)" }}>
						{s}
					</div>
				))}
			</nav>
			<div className="scroll" style={{ flex: 1, padding: 24, fontSize: 13 }}>
				<h1 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 20px" }}>Personalization</h1>
				<section style={{ border: "1px solid var(--border-l1)", borderRadius: 8, background: "var(--bg-layer-2)", padding: 16, marginBottom: 20 }}>
					<div style={{ fontWeight: 600, marginBottom: 4 }}>Choose your mode</div>
					<div style={{ color: "var(--label-secondary)", marginBottom: 12 }}>Every surface renders in both. Stratum follows the workstation.</div>
					<div style={{ display: "flex", gap: 12 }}>
						{(["light", "dark"] as const).map((t) => (
							<button
								key={t}
								onClick={() => setTheme(t)}
								aria-pressed={theme === t}
								style={{ width: 140, borderRadius: 8, overflow: "hidden", border: `2px solid ${theme === t ? "var(--accent)" : "var(--border-l2)"}`, background: "var(--bg-layer-1)", textAlign: "left" }}
							>
								<div style={{ height: 80, background: t === "dark" ? "linear-gradient(135deg,#0a1533,#1f4d9e)" : "linear-gradient(135deg,#6fb4ff,#163a86)", position: "relative" }}>
									<div style={{ position: "absolute", left: 14, top: 14, right: 14, bottom: 14, background: t === "dark" ? "#1c1c1f" : "#ffffff", borderRadius: 4, opacity: 0.95 }} />
								</div>
								<div style={{ padding: "8px 10px" }}>{t === "dark" ? "Dark" : "Light"}</div>
							</button>
						))}
					</div>
				</section>
				<section style={{ border: "1px solid var(--border-l1)", borderRadius: 8, background: "var(--bg-layer-2)", padding: 16 }}>
					<div style={{ fontWeight: 600, marginBottom: 4 }}>About this workstation</div>
					<div style={{ color: "var(--label-secondary)", lineHeight: 1.6 }}>
						CMPDI-WS-0930 · Officer account · Demo build.
						<br />
						This is a simulated workstation running in a browser so that Stratum can be shown at a link. Stratum's model plane in this build is hosted through the Groq API and says so on screen; the product itself runs local models on the officer's machine.
					</div>
				</section>
			</div>
		</div>
	);
}
