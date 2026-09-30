import { useCallback, useRef } from "react";
import { getApp } from "../kernel/apps";
import { TASKBAR_HEIGHT, useOS, type WindowState } from "../kernel/store";
import { AppIcon } from "./Icon";

export function Window({ win }: { win: WindowState }) {
	const { focused, focusWindow, closeWindow, minimizeWindow, maximizeWindow, moveWindow, resizeWindow } = useOS();
	const app = getApp(win.app);
	const dragRef = useRef<{ dx: number; dy: number } | null>(null);
	const sizeRef = useRef<{ sx: number; sy: number; w: number; h: number } | null>(null);
	const active = focused === win.id;

	const onTitlePointerDown = useCallback(
		(e: React.PointerEvent) => {
			if ((e.target as HTMLElement).closest("button")) return;
			if (win.maximized) return;
			focusWindow(win.id);
			dragRef.current = { dx: e.clientX - win.x, dy: e.clientY - win.y };
			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		},
		[win.id, win.x, win.y, win.maximized, focusWindow],
	);
	const onTitlePointerMove = useCallback(
		(e: React.PointerEvent) => {
			if (!dragRef.current) return;
			const x = Math.max(-win.w + 120, Math.min(window.innerWidth - 80, e.clientX - dragRef.current.dx));
			const y = Math.max(0, Math.min(window.innerHeight - TASKBAR_HEIGHT - 32, e.clientY - dragRef.current.dy));
			moveWindow(win.id, x, y);
		},
		[win.id, win.w, moveWindow],
	);
	const onTitlePointerUp = useCallback(() => {
		dragRef.current = null;
	}, []);

	const onResizeDown = useCallback(
		(e: React.PointerEvent) => {
			focusWindow(win.id);
			sizeRef.current = { sx: e.clientX, sy: e.clientY, w: win.w, h: win.h };
			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
			e.stopPropagation();
		},
		[win.id, win.w, win.h, focusWindow],
	);
	const onResizeMove = useCallback(
		(e: React.PointerEvent) => {
			if (!sizeRef.current) return;
			resizeWindow(win.id, sizeRef.current.w + (e.clientX - sizeRef.current.sx), sizeRef.current.h + (e.clientY - sizeRef.current.sy));
		},
		[win.id, resizeWindow],
	);
	const onResizeUp = useCallback(() => {
		sizeRef.current = null;
	}, []);

	if (!app) return null;
	const Body = app.component;
	const frame: React.CSSProperties = win.maximized
		? { left: 0, top: 0, width: "100vw", height: `calc(100vh - ${TASKBAR_HEIGHT}px)`, borderRadius: 0 }
		: { left: win.x, top: win.y, width: win.w, height: win.h, borderRadius: 8 };

	return (
		<section
			role="dialog"
			aria-label={win.title}
			className="fade-up"
			onPointerDown={() => {
				if (!active) focusWindow(win.id);
			}}
			style={{
				position: "absolute",
				pointerEvents: "auto",
				...frame,
				zIndex: win.z,
				display: win.minimized ? "none" : "flex",
				flexDirection: "column",
				background: "var(--bg-layer-1)",
				border: `1px solid ${active ? "var(--border-l3)" : "var(--border-l2)"}`,
				boxShadow: active ? "var(--shadow-window)" : "var(--shadow-lv2)",
				overflow: "hidden",
				color: "var(--label-primary)",
			}}
		>
			<header
				onPointerDown={onTitlePointerDown}
				onPointerMove={onTitlePointerMove}
				onPointerUp={onTitlePointerUp}
				onDoubleClick={() => maximizeWindow(win.id)}
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					height: 36,
					padding: "0 0 0 10px",
					background: active ? "var(--bg-layer-1)" : "var(--bg-layer-2)",
					borderBottom: "1px solid var(--border-l1)",
					userSelect: "none",
					touchAction: "none",
					cursor: win.maximized ? "default" : "default",
					flex: "0 0 auto",
				}}
			>
				<AppIcon app={win.app} size={16} />
				<span style={{ fontSize: 12, color: active ? "var(--label-primary)" : "var(--label-secondary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
					{win.title}
				</span>
				<TitleButton label="Minimize" onClick={() => minimizeWindow(win.id)}>
					<svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5h10" stroke="currentColor" strokeWidth="1" /></svg>
				</TitleButton>
				<TitleButton label={win.maximized ? "Restore" : "Maximize"} onClick={() => maximizeWindow(win.id)}>
					{win.maximized ? (
						<svg width="10" height="10" viewBox="0 0 10 10"><path d="M2.5 0.5h7v7M0.5 2.5h7v7h-7z" stroke="currentColor" strokeWidth="1" fill="none" /></svg>
					) : (
						<svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1" fill="none" /></svg>
					)}
				</TitleButton>
				<TitleButton label="Close" onClick={() => closeWindow(win.id)} danger>
					<svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1.1" /></svg>
				</TitleButton>
			</header>
			<div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", position: "relative" }}>
				<Body windowId={win.id} args={win.args} nonce={win.nonce} />
			</div>
			{!win.maximized && (
				<div
					onPointerDown={onResizeDown}
					onPointerMove={onResizeMove}
					onPointerUp={onResizeUp}
					aria-label="Resize"
					style={{ position: "absolute", right: 0, bottom: 0, width: 16, height: 16, cursor: "nwse-resize", touchAction: "none" }}
				/>
			)}
		</section>
	);
}

function TitleButton({ label, onClick, children, danger }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
	return (
		<button
			aria-label={label}
			title={label}
			onClick={onClick}
			className="title-btn"
			style={{ width: 46, height: 36, display: "grid", placeItems: "center", color: "var(--label-secondary)" }}
			onPointerEnter={(e) => {
				e.currentTarget.style.background = danger ? "#e81123" : "var(--interactive-hover)";
				e.currentTarget.style.color = danger ? "#fff" : "var(--label-primary)";
			}}
			onPointerLeave={(e) => {
				e.currentTarget.style.background = "";
				e.currentTarget.style.color = "var(--label-secondary)";
			}}
		>
			{children}
		</button>
	);
}
