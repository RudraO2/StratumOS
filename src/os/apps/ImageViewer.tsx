import { useEffect, useState } from "react";
import type { AppProps } from "../kernel/apps";
import { normalizePath } from "../kernel/fs";
import { useOS } from "../kernel/store";

export function ImageViewer({ args }: AppProps) {
	const fs = useOS((s) => s.fs);
	const path = args?.path ? normalizePath(args.path as string) : null;
	const [url, setUrl] = useState<string | null>(null);
	useEffect(() => {
		if (!path) return;
		try {
			const f = fs.read(path);
			const data = typeof f.data === "string" ? f.data : (f.data as Uint8Array<ArrayBuffer>);
			const blob = new Blob([data], { type: f.mime });
			const u = URL.createObjectURL(blob);
			setUrl(u);
			return () => URL.revokeObjectURL(u);
		} catch {
			setUrl(null);
		}
	}, [path, fs]);
	return (
		<div style={{ flex: 1, display: "grid", placeItems: "center", background: "var(--bg-layer-3)", overflow: "hidden" }}>
			{url ? <img src={url} alt={path ?? ""} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <span style={{ color: "var(--label-tertiary)" }}>Nothing to show.</span>}
		</div>
	);
}
