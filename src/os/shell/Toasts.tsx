import { TASKBAR_HEIGHT, useOS } from "../kernel/store";

const TONE: Record<string, string> = {
	info: "var(--accent)",
	done: "var(--state-done)",
	warning: "var(--warn-primary)",
	error: "var(--error-primary)",
};

export function Toasts() {
	const { toasts, dismissToast } = useOS();
	return (
		<div style={{ position: "absolute", right: 16, bottom: TASKBAR_HEIGHT + 16, display: "flex", flexDirection: "column", gap: 10, zIndex: 99998, width: 360, pointerEvents: "none" }}>
			{toasts.map((t) => (
				<section
					key={t.id}
					role="status"
					className="acrylic fade-up"
					style={{ pointerEvents: "auto", borderRadius: 8, padding: "12px 14px", boxShadow: "var(--shadow-lv2)", display: "flex", gap: 12, alignItems: "flex-start", color: "var(--label-primary)" }}
				>
					<span aria-hidden style={{ width: 10, height: 10, borderRadius: "50%", background: TONE[t.tone], marginTop: 4, flex: "0 0 auto" }} />
					<div style={{ flex: 1, minWidth: 0 }}>
						<div style={{ fontSize: 13, fontWeight: 600 }}>{t.title}</div>
						<div style={{ fontSize: 12, color: "var(--label-secondary)", overflowWrap: "anywhere", marginTop: 2 }}>{t.body}</div>
						<div style={{ fontSize: 11, color: "var(--label-tertiary)", marginTop: 6 }}>Stratum</div>
					</div>
					<button aria-label="Dismiss" onClick={() => dismissToast(t.id)} style={{ color: "var(--label-tertiary)", fontSize: 14, lineHeight: 1 }}>
						×
					</button>
				</section>
			))}
		</div>
	);
}
