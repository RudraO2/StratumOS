import { useEffect, useState } from "react";
import { allApps } from "../kernel/apps";
import { launch } from "../kernel/launch";
import { TASKBAR_HEIGHT, useOS } from "../kernel/store";
import { AppIcon } from "./Icon";

export function Taskbar() {
	const { windows, focused, focusWindow, minimizeWindow, startOpen, setStartOpen, theme, setTheme } = useOS();
	const [now, setNow] = useState(new Date());
	useEffect(() => {
		const t = setInterval(() => setNow(new Date()), 15000);
		return () => clearInterval(t);
	}, []);
	const pinned = allApps().filter((a) => a.pinned);
	const running = new Map<string, typeof windows>();
	for (const w of windows) running.set(w.app, [...(running.get(w.app) ?? []), w]);
	const order = [...pinned.map((a) => a.id), ...[...running.keys()].filter((id) => !pinned.some((a) => a.id === id))];

	return (
		<footer
			className="acrylic"
			style={{
				position: "absolute",
				left: 0,
				right: 0,
				bottom: 0,
				height: TASKBAR_HEIGHT,
				display: "grid",
				gridTemplateColumns: "1fr auto 1fr",
				alignItems: "center",
				zIndex: 100000,
				borderLeft: "none",
				borderRight: "none",
				borderBottom: "none",
			}}
		>
			<div />
			<div style={{ display: "flex", alignItems: "center", gap: 4 }}>
				<TaskButton label="Start" active={startOpen} onClick={() => setStartOpen(!startOpen)}>
					<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
						<rect x="2" y="2" width="7" height="7" rx="1" fill="#4cc2ff" />
						<rect x="11" y="2" width="7" height="7" rx="1" fill="#4cc2ff" />
						<rect x="2" y="11" width="7" height="7" rx="1" fill="#4cc2ff" />
						<rect x="11" y="11" width="7" height="7" rx="1" fill="#4cc2ff" />
					</svg>
				</TaskButton>
				{order.map((appId) => {
					const wins = running.get(appId) ?? [];
					const isActive = wins.some((w) => w.id === focused && !w.minimized);
					return (
						<TaskButton
							key={appId}
							label={allApps().find((a) => a.id === appId)?.title ?? appId}
							active={isActive}
							running={wins.length > 0}
							onClick={() => {
								if (wins.length === 0) launch(appId);
								else if (isActive) minimizeWindow(focused!);
								else focusWindow([...wins].sort((a, b) => b.z - a.z)[0].id);
							}}
						>
							<AppIcon app={appId} size={24} />
						</TaskButton>
					);
				})}
			</div>
			<div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 2, paddingRight: 8 }}>
				<button
					onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
					title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
					style={{ height: 36, padding: "0 10px", borderRadius: 6, display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--label-secondary)" }}
					onPointerEnter={(e) => (e.currentTarget.style.background = "var(--interactive-hover)")}
					onPointerLeave={(e) => (e.currentTarget.style.background = "")}
				>
					{theme === "dark" ? (
						<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><circle cx="8" cy="8" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
					) : (
						<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M13.5 10.2A6 6 0 0 1 5.8 2.5a6 6 0 1 0 7.7 7.7z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
					)}
				</button>
				<div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 8px", fontSize: 12, color: "var(--label-primary)" }}>
					<span title="Network: no route off the box" aria-label="Network">
						<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M1 6.5a10 10 0 0 1 14 0M3.5 9a6.5 6.5 0 0 1 9 0M6 11.5a3 3 0 0 1 4 0" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /><circle cx="8" cy="14" r="1" fill="currentColor" /><path d="M2 2l12 12" stroke="var(--error-primary)" strokeWidth="1.3" strokeLinecap="round" /></svg>
					</span>
					<span aria-hidden>
						<svg width="16" height="16" viewBox="0 0 16 16"><path d="M8 3.5a4 4 0 0 0-4 4v2.2l-1 1.3v.5h10v-.5l-1-1.3V7.5a4 4 0 0 0-4-4zM6.5 12.5a1.5 1.5 0 0 0 3 0" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>
					</span>
				</div>
				<div className="tabular" style={{ textAlign: "right", fontSize: 12, lineHeight: 1.25, padding: "0 8px 0 4px", minWidth: 64 }}>
					<div>{now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</div>
					<div style={{ color: "var(--label-secondary)" }}>{now.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" })}</div>
				</div>
			</div>
		</footer>
	);
}

function TaskButton({ label, active, running, onClick, children }: { label: string; active?: boolean; running?: boolean; onClick: () => void; children: React.ReactNode }) {
	return (
		<button
			aria-label={label}
			title={label}
			onClick={onClick}
			style={{
				width: 40,
				height: 40,
				borderRadius: 6,
				display: "grid",
				placeItems: "center",
				position: "relative",
				background: active ? "var(--interactive-hover)" : "transparent",
				transition: "background 120ms ease",
			}}
			onPointerEnter={(e) => (e.currentTarget.style.background = "var(--interactive-hover)")}
			onPointerLeave={(e) => (e.currentTarget.style.background = active ? "var(--interactive-hover)" : "transparent")}
		>
			{children}
			{running && (
				<span
					aria-hidden
					style={{ position: "absolute", bottom: 2, left: "50%", width: 16, height: 3, borderRadius: 2, background: active ? "var(--accent)" : "var(--label-tertiary)", transform: `translateX(-50%) scaleX(${active ? 1 : 0.375})`, transition: "transform 120ms ease" }}
				/>
			)}
		</button>
	);
}
