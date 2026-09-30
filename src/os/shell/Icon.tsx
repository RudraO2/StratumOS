import type { CSSProperties } from "react";

/** Simple inline icons in a Fluent-ish style. No trademarks. */
export function AppIcon({ app, size = 32, style }: { app: string; size?: number; style?: CSSProperties }) {
	const s = { width: size, height: size, flex: "0 0 auto", ...style };
	switch (app) {
		case "stratum":
		case "welcome":
			return <img src="/favicon.svg" alt="" style={{ ...s, borderRadius: Math.max(4, size * 0.22) }} draggable={false} />;
		case "library":
			return (
				<svg viewBox="0 0 32 32" style={s} aria-hidden>
					<rect x="3" y="3" width="26" height="26" rx="6.5" fill="#2b2f36" />
					<path d="M8 10h16M8 16h16M8 22h10" stroke="#e2894f" strokeWidth="2.2" strokeLinecap="round" />
					<circle cx="23" cy="22" r="2.4" fill="#ffffff" />
				</svg>
			);
		case "explorer":
			return (
				<svg viewBox="0 0 32 32" style={s} aria-hidden>
					<path d="M3 8a2 2 0 0 1 2-2h7l3 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="#f7c948" />
					<path d="M3 13h26v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="#ffdd6b" />
				</svg>
			);
		case "terminal":
			return (
				<svg viewBox="0 0 32 32" style={s} aria-hidden>
					<rect x="3" y="5" width="26" height="22" rx="3" fill="#1f2430" />
					<path d="M8 12l5 4-5 4" stroke="#7ee787" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
					<path d="M15 20h8" stroke="#e6edf3" strokeWidth="2" strokeLinecap="round" />
				</svg>
			);
		case "browser":
			return (
				<svg viewBox="0 0 32 32" style={s} aria-hidden>
					<circle cx="16" cy="16" r="12" fill="#2f80ed" />
					<path d="M4.5 16h23M16 4a18 18 0 0 1 0 24M16 4a18 18 0 0 0 0 24" stroke="#cfe6ff" strokeWidth="1.6" fill="none" />
					<path d="M6 10.5c3 1.5 17 1.5 20 0M6 21.5c3-1.5 17-1.5 20 0" stroke="#cfe6ff" strokeWidth="1.4" fill="none" />
				</svg>
			);
		case "notepad":
			return (
				<svg viewBox="0 0 32 32" style={s} aria-hidden>
					<path d="M7 3h13l6 6v20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill="#eef2f7" stroke="#b9c3d0" />
					<path d="M20 3v6h6" fill="#d5dde8" />
					<path d="M10 14h12M10 18h12M10 22h8" stroke="#4d6bfe" strokeWidth="1.6" strokeLinecap="round" />
				</svg>
			);
		case "settings":
			return (
				<svg viewBox="0 0 32 32" style={s} aria-hidden>
					<path
						d="M16 3l2.6 2.1 3.3-.6 1.4 3.1 3.1 1.4-.6 3.3L28 16l-2.1 2.6.6 3.3-3.1 1.4-1.4 3.1-3.3-.6L16 29l-2.6-2.1-3.3.6-1.4-3.1-3.1-1.4.6-3.3L4 16l2.1-2.6-.6-3.3 3.1-1.4 1.4-3.1 3.3.6z"
						fill="#8a94a6"
					/>
					<circle cx="16" cy="16" r="5" fill="#eef2f7" />
				</svg>
			);
		case "viewer":
			return (
				<svg viewBox="0 0 32 32" style={s} aria-hidden>
					<rect x="3" y="6" width="26" height="20" rx="2" fill="#3ba55d" />
					<path d="M6 23l6-7 4 5 3-3 7 5z" fill="#c9f2d6" />
					<circle cx="22" cy="12" r="2.5" fill="#fff4b0" />
				</svg>
			);
		default:
			return <div style={{ ...s, borderRadius: 6, background: "var(--border-l3)" }} />;
	}
}
