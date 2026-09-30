import { useEffect, useRef, useState } from "react";
import { loadSample, prepareImageFile, SAMPLE_IMAGES, SUGGESTED_PROMPTS as SUGGESTED_PROMPTS_LIST } from "../samples";
import { useStratum } from "../store";
import { runTurn } from "../turn";
import { RoutingChip } from "./RoutingChip";

const ATTACH_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

export function Composer({ hero }: { hero: boolean }) {
	const busy = useStratum((s) => s.busy);
	const pendingImage = useStratum((s) => s.pendingImage);
	const setPendingImage = useStratum((s) => s.setPendingImage);
	const setPreviewImage = useStratum((s) => s.setPreviewImage);
	const [text, setText] = useState("");
	const [menuOpen, setMenuOpen] = useState(false);
	const [loadingSample, setLoadingSample] = useState<string | null>(null);
	const fileRef = useRef<HTMLInputElement>(null);
	const areaRef = useRef<HTMLTextAreaElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!menuOpen) return;
		const onDown = (e: PointerEvent) => {
			if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
		};
		window.addEventListener("pointerdown", onDown);
		return () => window.removeEventListener("pointerdown", onDown);
	}, [menuOpen]);

	const attach = async (file: File | null | undefined) => {
		if (!file || !ATTACH_ACCEPT.split(",").includes(file.type)) return;
		setPendingImage(await prepareImageFile(file));
	};

	const attachSample = async (id: string) => {
		setMenuOpen(false);
		setLoadingSample(id);
		try {
			setPendingImage(await loadSample(id));
			areaRef.current?.focus();
		} finally {
			setLoadingSample(null);
		}
	};

	const send = () => {
		const t = text.trim();
		if (t === "" || busy) return;
		setText("");
		void runTurn(t, pendingImage ?? undefined);
	};

	const menuItem = (label: string, onClick: () => void, hint?: string) => (
		<button
			key={label}
			role="menuitem"
			onClick={onClick}
			style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 6, fontSize: 13 }}
			onPointerEnter={(e) => (e.currentTarget.style.background = "var(--interactive-hover)")}
			onPointerLeave={(e) => (e.currentTarget.style.background = "")}
		>
			{label}
			{hint && <span style={{ display: "block", fontSize: 11.5, color: "var(--label-tertiary)", marginTop: 1 }}>{hint}</span>}
		</button>
	);

	return (
		<div
			data-tour="composer"
			onPaste={(e) => {
				const item = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"));
				if (item) {
					e.preventDefault();
					void attach(item.getAsFile());
				}
			}}
			onDragOver={(e) => e.preventDefault()}
			onDrop={(e) => {
				e.preventDefault();
				void attach(e.dataTransfer.files[0]);
			}}
			style={{
				width: "100%",
				maxWidth: hero ? 780 : "min(880px, 100%)",
				margin: "0 auto",
				border: "1px solid var(--border-l2)",
				borderRadius: 20,
				background: "var(--bg-layer-1)",
				boxShadow: "var(--shadow-lv2)",
				padding: "12px 12px 10px",
			}}
		>
			{pendingImage && (
				<div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
					<span style={{ position: "relative", display: "inline-block" }}>
						<img
							src={pendingImage.url}
							alt="Attached image — click to preview"
							title="Click to preview"
							onClick={() => setPreviewImage(pendingImage.url)}
							style={{ height: 72, maxWidth: 160, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border-l2)", display: "block", cursor: "zoom-in", background: "#ffffff" }}
						/>
						<button
							onClick={() => setPendingImage(null)}
							aria-label="Remove the attached image"
							title="Remove"
							style={{ position: "absolute", top: -7, right: -7, width: 20, height: 20, borderRadius: "50%", background: "var(--label-primary)", color: "var(--bg-layer-1)", fontSize: 13, lineHeight: 1, display: "grid", placeItems: "center", boxShadow: "var(--shadow-lv2)" }}
						>
							×
						</button>
					</span>
					<span style={{ fontSize: 12, color: "var(--label-secondary)" }}>Attached page — goes to the vision model as pixels.</span>
				</div>
			)}
			<textarea
				ref={areaRef}
				value={text}
				onChange={(e) => setText(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter" && !e.shiftKey) {
						e.preventDefault();
						send();
					}
				}}
				placeholder={hero ? "Ask about the library, paste a Parliament question, or ask for a report" : "Message Stratum"}
				rows={hero ? 2 : 1}
				aria-label="Message"
				style={{ width: "100%", resize: "none", border: "none", outline: "none", background: "transparent", fontSize: 15, lineHeight: 1.45, padding: "4px 6px", minHeight: hero ? 52 : 34, maxHeight: 200, overflow: "auto" }}
			/>
			<div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
				<div ref={menuRef} style={{ position: "relative" }}>
					<button
						data-tour="attach"
						aria-label="Attach a page image"
						title="Attach a page image"
						onClick={() => setMenuOpen((v) => !v)}
						style={{ width: 28, height: 28, borderRadius: 999, background: "var(--selector)", display: "grid", placeItems: "center", fontSize: 18, lineHeight: 1, color: "var(--label-primary)" }}
					>
						{loadingSample ? <span style={{ width: 12, height: 12, borderRadius: "50%", border: "2px solid var(--border-l3)", borderTopColor: "var(--label-primary)", animation: "spin 900ms linear infinite" }} /> : "+"}
					</button>
					{menuOpen && (
						<div role="menu" className="fade-up" style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 0, minWidth: 300, background: "var(--bg-layer-1)", border: "1px solid var(--border-l2)", borderRadius: 10, boxShadow: "var(--shadow-lv2)", padding: 6, zIndex: 50 }}>
							{menuItem("Attach an image", () => {
								setMenuOpen(false);
								fileRef.current?.click();
							}, "PNG, JPEG, WebP or GIF from this computer")}
							<div style={{ borderTop: "1px solid var(--border-l1)", margin: "6px 4px" }} />
							<div style={{ padding: "4px 10px 2px", fontSize: 11, color: "var(--label-tertiary)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Sample to try</div>
							{SAMPLE_IMAGES.map((s) => menuItem(s.label, () => void attachSample(s.id), s.hint))}
						</div>
					)}
					<input ref={fileRef} type="file" accept={ATTACH_ACCEPT} style={{ display: "none" }} tabIndex={-1} aria-hidden onChange={(e) => void attach(e.target.files?.[0])} />
				</div>
				<span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--label-secondary)", padding: "0 6px" }}>
					<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden><path d="M8 1.5l5.5 2.5v4c0 3-2.3 5.4-5.5 6.5C4.8 13.4 2.5 11 2.5 8V4z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
					Sample library
				</span>
				<span style={{ flex: 1 }} />
				<RoutingChip locked={busy} />
				<button
					onClick={send}
					disabled={busy || text.trim() === ""}
					aria-label="Send"
					style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--accent)", color: "var(--accent-label)", display: "grid", placeItems: "center", opacity: busy || text.trim() === "" ? 0.45 : 1 }}
				>
					<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden><path d="M8 13V3M4 7l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
				</button>
			</div>
		</div>
	);
}

/** Ready-made prompts under the composer on a new session. A chip runs the turn, attaching a sample image when the prompt needs one. */
export function SuggestedPrompts() {
	const busy = useStratum((s) => s.busy);
	const [loading, setLoading] = useState<string | null>(null);
	return (
		<div style={{ width: "100%", maxWidth: 780, display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
			{SUGGESTED_PROMPTS_LIST.map((p) => (
				<button
					key={p.label}
					disabled={busy || loading !== null}
					title={p.text}
					onClick={async () => {
						setLoading(p.label);
						try {
							const image = p.image ? await loadSample(p.image) : undefined;
							void runTurn(p.text, image);
						} finally {
							setLoading(null);
						}
					}}
					style={{
						padding: "7px 12px",
						borderRadius: 999,
						border: "1px solid var(--border-l2)",
						background: "var(--bg-layer-2)",
						fontSize: 12.5,
						color: "var(--label-primary)",
						opacity: busy ? 0.6 : 1,
						display: "inline-flex",
						alignItems: "center",
						gap: 6,
					}}
					onPointerEnter={(e) => (e.currentTarget.style.background = "var(--interactive-hover)")}
					onPointerLeave={(e) => (e.currentTarget.style.background = "var(--bg-layer-2)")}
				>
					{p.image && (
						<svg width="12" height="12" viewBox="0 0 16 16" aria-hidden><rect x="1.5" y="3" width="13" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" /><path d="M3 12l3.5-4 2.5 3 2-2 2.5 3" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>
					)}
					{loading === p.label ? "Attaching…" : p.label}
				</button>
			))}
		</div>
	);
}
