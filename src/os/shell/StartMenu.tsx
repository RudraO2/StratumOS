import { allApps } from "../kernel/apps";
import { launch } from "../kernel/launch";
import { TASKBAR_HEIGHT, useOS } from "../kernel/store";
import { AppIcon } from "./Icon";

export function StartMenu() {
	const { startOpen, setStartOpen } = useOS();
	if (!startOpen) return null;
	const apps = allApps().filter((a) => a.id !== "viewer");
	return (
		<div
			className="acrylic fade-up"
			role="menu"
			aria-label="Start"
			style={{
				position: "absolute",
				left: "50%",
				transform: "translateX(-50%)",
				bottom: TASKBAR_HEIGHT + 12,
				width: 560,
				maxWidth: "calc(100vw - 24px)",
				borderRadius: 10,
				padding: 24,
				zIndex: 99999,
				boxShadow: "var(--shadow-window)",
				color: "var(--label-primary)",
			}}
		>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
				<div style={{ fontSize: 13, fontWeight: 600 }}>Pinned</div>
				<div style={{ fontSize: 11, color: "var(--label-tertiary)" }}>CMPDI Workstation · CMPDI-WS-0930</div>
			</div>
			<div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 4 }}>
				{apps.map((a) => (
					<button
						key={a.id}
						role="menuitem"
						onClick={() => {
							setStartOpen(false);
							launch(a.id);
						}}
						style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "12px 4px", borderRadius: 6, fontSize: 12 }}
						onPointerEnter={(e) => (e.currentTarget.style.background = "var(--interactive-hover)")}
						onPointerLeave={(e) => (e.currentTarget.style.background = "")}
					>
						<AppIcon app={a.id} size={32} />
						<span style={{ textAlign: "center", lineHeight: 1.2 }}>{a.title}</span>
					</button>
				))}
			</div>
			<div style={{ borderTop: "1px solid var(--border-l1)", marginTop: 20, paddingTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
				<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
					<span style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--accent)", color: "var(--accent-label)", display: "grid", placeItems: "center", fontWeight: 600 }}>O</span>
					<span>Officer</span>
				</div>
				<span style={{ color: "var(--label-tertiary)" }}>Demo workstation · simulated</span>
			</div>
		</div>
	);
}
