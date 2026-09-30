import { useEffect, useState } from "react";
import type { AppProps } from "../kernel/apps";
import { HOME, isTextMime, normalizePath, parentOf, type FsNode } from "../kernel/fs";
import { launch } from "../kernel/launch";
import { useOS } from "../kernel/store";
import { AppIcon } from "../shell/Icon";

const NAV = [
	{ label: "Home", path: HOME },
	{ label: "Desktop", path: `${HOME}\\Desktop` },
	{ label: "Documents", path: `${HOME}\\Documents` },
	{ label: "Pictures", path: `${HOME}\\Pictures` },
	{ label: "Downloads", path: `${HOME}\\Downloads` },
	{ label: "This PC", path: "C:\\" },
];

export function downloadNode(node: FsNode & { kind: "file" }) {
	const blob = new Blob([typeof node.data === "string" ? node.data : (node.data as Uint8Array<ArrayBuffer>)], { type: node.mime });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = node.name;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function openFile(path: string) {
	const fs = useOS.getState().fs;
	const node = fs.stat(path);
	if (!node) return;
	if (node.kind === "dir") {
		launch("explorer", { path });
		return;
	}
	if (node.href) launch("browser", { url: node.href }, node.name);
	else if (isTextMime(node.mime)) launch("notepad", { path }, node.name + " - Notepad");
	else if (node.mime.startsWith("image/")) launch("viewer", { path }, node.name);
	else downloadNode(node);
}

export function Explorer({ args, nonce, windowId }: AppProps) {
	const { fs, fsVersion, setTitle } = useOS();
	const [path, setPath] = useState<string>(normalizePath((args?.path as string) ?? HOME));
	const [selected, setSelected] = useState<string | null>((args?.highlight as string) ?? null);
	const [address, setAddress] = useState(path);

	useEffect(() => {
		const p = normalizePath((args?.path as string) ?? HOME);
		setPath(p);
		setAddress(p);
		setSelected((args?.highlight as string) ?? null);
	}, [nonce, args]);
	useEffect(() => {
		setTitle(windowId, path === "C:\\" ? "This PC" : path.slice(path.lastIndexOf("\\") + 1));
		setAddress(path);
	}, [path, windowId, setTitle]);

	let items: FsNode[] = [];
	let error: string | null = null;
	try {
		items = fs.list(path);
	} catch (e) {
		error = e instanceof Error ? e.message : String(e);
	}
	void fsVersion;

	const crumbs = path === "C:\\" ? ["This PC"] : ["This PC", ...path.slice(3).split("\\").filter(Boolean)];
	const go = (p: string) => {
		setPath(normalizePath(p));
		setSelected(null);
	};

	return (
		<div style={{ display: "flex", flexDirection: "column", height: "100%", fontSize: 13 }}>
			<div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderBottom: "1px solid var(--border-l1)", background: "var(--bg-layer-2)" }}>
				<NavBtn label="Back" onClick={() => go(parentOf(path))} disabled={path === "C:\\"}>‹</NavBtn>
				<NavBtn label="Up" onClick={() => go(parentOf(path))} disabled={path === "C:\\"}>↑</NavBtn>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						if (fs.isDir(address)) go(address);
						else if (fs.exists(address)) openFile(address);
					}}
					style={{ flex: 1, display: "flex", alignItems: "center", gap: 4, border: "1px solid var(--border-l2)", borderRadius: 4, background: "var(--bg-layer-1)", padding: "4px 8px" }}
				>
					<div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, overflow: "hidden" }}>
						{crumbs.map((c, i) => (
							<span key={i} style={{ display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
								{i > 0 && <span style={{ color: "var(--label-tertiary)" }}>›</span>}
								<button
									onClick={() => go(i === 0 ? "C:\\" : "C:\\" + crumbs.slice(1, i + 1).join("\\"))}
									style={{ padding: "2px 4px", borderRadius: 3 }}
									onPointerEnter={(e) => (e.currentTarget.style.background = "var(--interactive-hover)")}
									onPointerLeave={(e) => (e.currentTarget.style.background = "")}
								>
									{c}
								</button>
							</span>
						))}
					</div>
					<input
						aria-label="Address"
						value={address}
						onChange={(e) => setAddress(e.target.value)}
						style={{ width: 0, opacity: 0, position: "absolute" }}
					/>
				</form>
			</div>
			<div style={{ display: "flex", flex: 1, minHeight: 0 }}>
				<nav style={{ width: 180, borderRight: "1px solid var(--border-l1)", padding: "8px 6px", background: "var(--bg-layer-2)", flex: "0 0 auto" }}>
					{NAV.map((n) => (
						<button
							key={n.path}
							onClick={() => go(n.path)}
							style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 10px", borderRadius: 4, background: path === n.path ? "var(--selector)" : "transparent", textAlign: "left" }}
							onPointerEnter={(e) => (e.currentTarget.style.background = "var(--interactive-hover)")}
							onPointerLeave={(e) => (e.currentTarget.style.background = path === n.path ? "var(--selector)" : "transparent")}
						>
							<AppIcon app="explorer" size={16} />
							{n.label}
						</button>
					))}
				</nav>
				<div className="scroll" style={{ flex: 1, padding: 8 }} onClick={() => setSelected(null)}>
					{error ? (
						<div style={{ padding: 16, color: "var(--label-secondary)" }}>{error}</div>
					) : items.length === 0 ? (
						<div style={{ padding: 24, color: "var(--label-tertiary)", textAlign: "center" }}>This folder is empty.</div>
					) : (
						<table style={{ width: "100%", borderCollapse: "collapse" }}>
							<thead>
								<tr style={{ color: "var(--label-secondary)", fontSize: 12, textAlign: "left" }}>
									<th style={{ fontWeight: 400, padding: "4px 8px" }}>Name</th>
									<th style={{ fontWeight: 400, padding: "4px 8px" }}>Date modified</th>
									<th style={{ fontWeight: 400, padding: "4px 8px" }}>Type</th>
									<th style={{ fontWeight: 400, padding: "4px 8px", textAlign: "right" }}>Size</th>
								</tr>
							</thead>
							<tbody>
								{items.map((n) => {
									const full = path.replace(/\\$/, "") + "\\" + n.name;
									const sel = selected?.toLowerCase() === n.name.toLowerCase() || selected?.toLowerCase() === full.toLowerCase();
									return (
										<tr
											key={n.name}
											onClick={(e) => {
												e.stopPropagation();
												setSelected(n.name);
											}}
											onDoubleClick={() => (n.kind === "dir" ? go(full) : openFile(full))}
											style={{ background: sel ? "color-mix(in srgb, var(--accent) 18%, transparent)" : "transparent", cursor: "default" }}
										>
											<td style={{ padding: "5px 8px", display: "flex", alignItems: "center", gap: 8 }}>
												<FileIcon node={n} />
												{n.name}
											</td>
											<td className="tabular" style={{ padding: "5px 8px", color: "var(--label-secondary)" }}>{new Date(n.modified).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}</td>
											<td style={{ padding: "5px 8px", color: "var(--label-secondary)" }}>{typeLabel(n)}</td>
											<td className="tabular" style={{ padding: "5px 8px", color: "var(--label-secondary)", textAlign: "right" }}>{n.kind === "file" ? sizeLabel(typeof n.data === "string" ? n.data.length : n.data.byteLength) : ""}</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					)}
				</div>
			</div>
			<div style={{ padding: "4px 12px", borderTop: "1px solid var(--border-l1)", fontSize: 12, color: "var(--label-secondary)" }}>
				{items.length} item{items.length === 1 ? "" : "s"}
				{selected ? ` · 1 selected` : ""}
			</div>
		</div>
	);
}

function NavBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
	return (
		<button aria-label={label} title={label} onClick={onClick} disabled={disabled} style={{ width: 28, height: 28, borderRadius: 4, fontSize: 16, color: disabled ? "var(--label-tertiary)" : "var(--label-primary)" }}>
			{children}
		</button>
	);
}

function FileIcon({ node }: { node: FsNode }) {
	if (node.kind === "dir") return <AppIcon app="explorer" size={18} />;
	if (node.mime.startsWith("image/")) return <AppIcon app="viewer" size={18} />;
	if (node.name.endsWith(".docx"))
		return (
			<svg width="18" height="18" viewBox="0 0 32 32" aria-hidden>
				<path d="M7 3h13l6 6v20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill="#2b5fb8" />
				<path d="M20 3v6h6" fill="#7ea7e6" />
				<text x="16" y="24" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff" fontFamily="system-ui">W</text>
			</svg>
		);
	return <AppIcon app="notepad" size={18} />;
}

function typeLabel(n: FsNode) {
	if (n.kind === "dir") return "File folder";
	const ext = n.name.split(".").pop()?.toUpperCase() ?? "";
	if (ext === "DOCX") return "Microsoft Word Document";
	if (ext === "TXT") return "Text Document";
	if (["PNG", "JPG", "JPEG", "WEBP", "GIF"].includes(ext)) return `${ext} File`;
	return `${ext} File`;
}

function sizeLabel(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	return `${Math.ceil(bytes / 1024)} KB`;
}
