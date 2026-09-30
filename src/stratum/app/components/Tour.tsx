import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { useStratum } from "../store";

interface Step {
	target: string;
	title: string;
	body: string;
	place: "above" | "below" | "right" | "left";
}

const STEPS: Step[] = [
	{ target: "composer", title: "Ask Stratum", body: "Type a question, paste a Parliament question, or ask for a report. Pick one of the ready-made prompts below the box to see each kind.", place: "above" },
	{ target: "attach", title: "Read a scanned page", body: "Attach an image of a page from the menu; the vision model reads it. The sample is a scanned coal directory page.", place: "above" },
	{ target: "chip", title: "The routing chip", body: "The router classifies each request (ask, PQ reply, report, topics) and picks a model. Click to see the scores.", place: "above" },
	{ target: "views", title: "Ask and Map", body: "Map shows the whole library as one connected picture: documents, subsidiaries, years and topics, with conflicts in red. Under any answer, Show on map lights up what it rested on.", place: "right" },
	{ target: "library", title: "The library", body: "The eight sample documents, the facts read from them with their status, topics and the measured metrics.", place: "right" },
	{ target: "seal", title: "The seal", body: "Outbound calls are refused before they run and counted here. Ask Stratum to open a website to see it work.", place: "right" },
	{ target: "provider", title: "Honest about the models", body: "This build answers through open-weight models hosted on Groq. The real product runs local models on the officer's machine.", place: "below" },
];

const TOUR_KEY = "stratum.tour.done";

export function tourSeen(): boolean {
	try {
		return localStorage.getItem(TOUR_KEY) === "1";
	} catch {
		return false;
	}
}

function markSeen() {
	try {
		localStorage.setItem(TOUR_KEY, "1");
	} catch {
		/* storage blocked */
	}
}

/** Coach marks over the Stratum window. Minimal: a ring around one element, one bubble, next/done, closable any time. */
export function Tour({ rootRef }: { rootRef: RefObject<HTMLDivElement> }) {
	const step = useStratum((s) => s.tourStep);
	const setTourStep = useStratum((s) => s.setTourStep);
	const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
	const current = step === null ? null : STEPS[step];

	const end = () => {
		markSeen();
		setTourStep(null);
	};

	useLayoutEffect(() => {
		if (!current || !rootRef.current) return;
		const measure = () => {
			const root = rootRef.current;
			const el = root?.querySelector<HTMLElement>(`[data-tour="${current.target}"]`);
			if (!root || !el) {
				setRect(null);
				return;
			}
			const r = el.getBoundingClientRect();
			const b = root.getBoundingClientRect();
			setRect({ x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height });
		};
		measure();
		const t = setTimeout(measure, 250);
		window.addEventListener("resize", measure);
		return () => {
			clearTimeout(t);
			window.removeEventListener("resize", measure);
		};
	}, [current, rootRef]);

	useEffect(() => {
		if (!current) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") end();
			if (e.key === "Enter" || e.key === "ArrowRight") next();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [current]);

	if (!current || step === null) return null;
	const next = () => (step + 1 >= STEPS.length ? end() : setTourStep(step + 1));
	const last = step + 1 >= STEPS.length;

	// Bubble placement relative to the ring.
	const pad = 6;
	const bubbleW = 280;
	let bubble: React.CSSProperties = {};
	if (rect) {
		const cx = rect.x + rect.w / 2;
		if (current.place === "above") bubble = { left: Math.max(12, Math.min(cx - bubbleW / 2, (rootRef.current?.clientWidth ?? 1000) - bubbleW - 12)), top: rect.y - pad - 12, transform: "translateY(-100%)" };
		else if (current.place === "below") bubble = { left: Math.max(12, Math.min(cx - bubbleW / 2, (rootRef.current?.clientWidth ?? 1000) - bubbleW - 12)), top: rect.y + rect.h + pad + 12 };
		else if (current.place === "right") bubble = { left: rect.x + rect.w + pad + 12, top: rect.y + rect.h / 2, transform: "translateY(-50%)" };
		else bubble = { left: rect.x - pad - 12, top: rect.y + rect.h / 2, transform: "translate(-100%, -50%)" };
	} else {
		bubble = { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
	}

	return (
		<div style={{ position: "absolute", inset: 0, zIndex: 70, pointerEvents: "none" }} aria-live="polite">
			{rect && (
				<div
					aria-hidden
					className="fade-in"
					style={{
						position: "absolute",
						left: rect.x - pad,
						top: rect.y - pad,
						width: rect.w + pad * 2,
						height: rect.h + pad * 2,
						borderRadius: 12,
						border: "2px solid var(--accent)",
						boxShadow: "0 0 0 4px color-mix(in srgb, var(--accent) 22%, transparent), 0 0 0 9999px rgba(0,0,0,0.28)",
						transition: "left 160ms ease, top 160ms ease, width 160ms ease, height 160ms ease",
					}}
				/>
			)}
			<section
				role="dialog"
				aria-label={`Tour step ${step + 1} of ${STEPS.length}`}
				className="fade-up"
				style={{
					position: "absolute",
					width: bubbleW,
					pointerEvents: "auto",
					background: "var(--bg-layer-1)",
					color: "var(--label-primary)",
					border: "1px solid var(--border-l2)",
					borderRadius: 12,
					boxShadow: "var(--shadow-window)",
					padding: "12px 14px 10px",
					fontSize: 13,
					lineHeight: 1.45,
					...bubble,
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
					<span style={{ fontSize: 11, color: "var(--label-tertiary)", fontVariantNumeric: "tabular-nums" }}>
						{step + 1} of {STEPS.length}
					</span>
					<span style={{ fontWeight: 600, flex: 1 }}>{current.title}</span>
					<button onClick={end} aria-label="Close the tour" title="Close (Esc)" style={{ width: 22, height: 22, borderRadius: 6, color: "var(--label-tertiary)", fontSize: 15, lineHeight: 1 }}>
						×
					</button>
				</div>
				<div style={{ color: "var(--label-secondary)" }}>{current.body}</div>
				<div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 10 }}>
					{!last && (
						<button onClick={end} style={{ padding: "5px 10px", borderRadius: 6, fontSize: 12, color: "var(--label-secondary)" }}>
							Skip
						</button>
					)}
					<button onClick={next} style={{ padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: "var(--accent)", color: "var(--accent-label)" }}>
						{last ? "Done" : "Next"}
					</button>
				</div>
			</section>
		</div>
	);
}
