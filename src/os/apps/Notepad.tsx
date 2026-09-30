import { useEffect, useState } from "react";
import type { AppProps } from "../kernel/apps";
import { normalizePath } from "../kernel/fs";
import { useOS } from "../kernel/store";

export function Notepad({ args, nonce, windowId }: AppProps) {
	const { fs, fsVersion, touchFs, setTitle } = useOS();
	const path = args?.path ? normalizePath(args.path as string) : null;
	const [text, setText] = useState("");
	const [dirty, setDirty] = useState(false);

	useEffect(() => {
		if (path && fs.exists(path)) {
			setText(fs.readText(path));
			setDirty(false);
		}
	}, [path, nonce, fsVersion, fs]);
	useEffect(() => {
		setTitle(windowId, `${dirty ? "*" : ""}${path ? path.slice(path.lastIndexOf("\\") + 1) : "Untitled"} - Notepad`);
	}, [dirty, path, windowId, setTitle]);

	const save = () => {
		if (!path) return;
		fs.write(path, text);
		touchFs();
		setDirty(false);
	};

	return (
		<div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
			<div style={{ display: "flex", gap: 2, padding: "4px 6px", borderBottom: "1px solid var(--border-l1)", fontSize: 12 }}>
				{["File", "Edit", "View"].map((m) => (
					<button key={m} onClick={m === "File" ? save : undefined} title={m === "File" ? "Save (Ctrl+S)" : undefined} style={{ padding: "3px 8px", borderRadius: 3 }}>
						{m}
					</button>
				))}
				<span style={{ flex: 1 }} />
				{path && (
					<button onClick={save} disabled={!dirty} style={{ padding: "3px 10px", borderRadius: 3, color: dirty ? "var(--label-primary)" : "var(--label-tertiary)" }}>
						Save
					</button>
				)}
			</div>
			<textarea
				className="mono scroll"
				value={text}
				spellCheck={false}
				onChange={(e) => {
					setText(e.target.value);
					setDirty(true);
				}}
				onKeyDown={(e) => {
					if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
						e.preventDefault();
						save();
					}
				}}
				style={{ flex: 1, resize: "none", border: "none", outline: "none", padding: 12, fontSize: 13, lineHeight: 1.5, background: "var(--bg-layer-1)", color: "var(--label-primary)", whiteSpace: "pre", overflow: "auto" }}
			/>
			<div style={{ padding: "3px 12px", borderTop: "1px solid var(--border-l1)", fontSize: 11, color: "var(--label-secondary)", display: "flex", gap: 24 }}>
				<span>{path ?? "Untitled"}</span>
				<span style={{ marginLeft: "auto" }}>{text.length} characters</span>
				<span>UTF-8</span>
			</div>
		</div>
	);
}
