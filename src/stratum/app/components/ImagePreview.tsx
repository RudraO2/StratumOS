import { useEffect } from "react";
import { useStratum } from "../store";

/** A preview of an attached image, inside the Stratum window: big enough to read, not full screen. */
export function ImagePreview() {
	const url = useStratum((s) => s.previewImage);
	const setPreviewImage = useStratum((s) => s.setPreviewImage);
	useEffect(() => {
		if (!url) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setPreviewImage(null);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [url, setPreviewImage]);
	if (!url) return null;
	return (
		<div
			role="dialog"
			aria-label="Attached image preview"
			className="fade-in"
			onClick={() => setPreviewImage(null)}
			style={{ position: "absolute", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "36px 40px 44px" }}
		>
			{/* The frame takes a definite height from the overlay, so the image's max-height resolves against it. */}
			<div
				onClick={(e) => e.stopPropagation()}
				style={{ position: "relative", height: "100%", maxWidth: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-layer-1)", borderRadius: 12, padding: 10, boxShadow: "var(--shadow-window)", border: "1px solid var(--border-l2)" }}
			>
				<img src={url} alt="Attached image" style={{ display: "block", maxHeight: "100%", maxWidth: "100%", width: "auto", height: "auto", objectFit: "contain", borderRadius: 6, background: "#ffffff" }} />
				<button
					onClick={() => setPreviewImage(null)}
					aria-label="Close preview"
					title="Close (Esc)"
					style={{ position: "absolute", top: -12, right: -12, width: 28, height: 28, borderRadius: "50%", background: "var(--label-primary)", color: "var(--bg-layer-1)", fontSize: 16, lineHeight: 1, display: "grid", placeItems: "center", boxShadow: "var(--shadow-lv2)" }}
				>
					×
				</button>
			</div>
			<div style={{ position: "absolute", left: 0, right: 0, bottom: 14, textAlign: "center", fontSize: 11.5, color: "rgba(255,255,255,0.75)", pointerEvents: "none" }}>
				Attached image · sent to the vision member as pixels · click outside or press Esc to close
			</div>
		</div>
	);
}
