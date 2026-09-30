import { useState } from "react";
import { allApps } from "../kernel/apps";
import { launch } from "../kernel/launch";
import { TASKBAR_HEIGHT, useOS } from "../kernel/store";
import { AppIcon } from "./Icon";
import { StartMenu } from "./StartMenu";
import { Taskbar } from "./Taskbar";
import { Toasts } from "./Toasts";
import { Window } from "./Window";

export function Desktop() {
	const { windows, setStartOpen, startOpen } = useOS();
	const icons = allApps().filter((a) => a.desktop);
	const [selected, setSelected] = useState<string | null>(null);
	return (
		<div
			style={{ position: "absolute", inset: 0, background: "var(--wallpaper)", overflow: "hidden", userSelect: "none" }}
			onPointerDown={(e) => {
				if (startOpen && !(e.target as HTMLElement).closest("[role=menu],footer")) setStartOpen(false);
				if (!(e.target as HTMLElement).closest("[data-desktop-icon]")) setSelected(null);
			}}
		>
			<div style={{ position: "absolute", left: 16, top: 16, display: "flex", flexDirection: "column", gap: 6 }}>
				{icons.map((a) => (
					<button
						key={a.id}
						data-desktop-icon={a.id}
						onClick={() => setSelected(a.id)}
						onDoubleClick={() => launch(a.id)}
						onKeyDown={(e) => {
							if (e.key === "Enter") launch(a.id);
						}}
						title={`${a.title} — double-click to open`}
						style={{ width: 84, padding: "8px 4px", borderRadius: 4, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.8)", fontSize: 12, lineHeight: 1.2, background: selected === a.id ? "rgba(255,255,255,0.22)" : "transparent", outline: selected === a.id ? "1px solid rgba(255,255,255,0.35)" : "none" }}
						onPointerEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.14)")}
						onPointerLeave={(e) => (e.currentTarget.style.background = selected === a.id ? "rgba(255,255,255,0.22)" : "transparent")}
					>
						<AppIcon app={a.id} size={40} />
						<span style={{ textAlign: "center" }}>{a.title}</span>
					</button>
				))}
			</div>
			<div style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: TASKBAR_HEIGHT, pointerEvents: "none" }}>
				{windows.map((w) => (
					<Window key={w.id} win={w} />
				))}
			</div>
			<Toasts />
			<StartMenu />
			<Taskbar />
		</div>
	);
}
