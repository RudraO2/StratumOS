/**
 * The virtual filesystem of the simulated workstation. In memory, seeded at
 * boot. Paths are Windows-style (`C:\Users\Officer\Documents`), matched
 * case-insensitively, with `/` tolerated.
 */
import { SAMPLE_PQ_TEXT } from "../../stratum/engine";

export type FsNode =
	| { kind: "dir"; name: string; children: Map<string, FsNode>; modified: number }
	| { kind: "file"; name: string; data: string | Uint8Array; mime: string; modified: number; href?: string };

export const HOME = "C:\\Users\\Officer";

export function normalizePath(path: string, cwd = HOME): string {
	let p = path.trim().replace(/\//g, "\\");
	if (p === "" || p === ".") p = cwd;
	else if (p === "~") p = HOME;
	else if (/^[a-z]:\\?$/i.test(p)) p = p.slice(0, 2) + "\\";
	else if (!/^[a-z]:\\/i.test(p)) p = cwd.replace(/\\$/, "") + "\\" + p;
	const drive = p.slice(0, 2).toUpperCase();
	const parts: string[] = [];
	for (const seg of p.slice(3).split("\\")) {
		if (seg === "" || seg === ".") continue;
		if (seg === "..") parts.pop();
		else parts.push(seg);
	}
	return drive + "\\" + parts.join("\\");
}

export function parentOf(path: string): string {
	const n = normalizePath(path);
	const i = n.lastIndexOf("\\");
	return i <= 2 ? n.slice(0, 3) : n.slice(0, i);
}

export function baseName(path: string): string {
	const n = normalizePath(path);
	return n.slice(n.lastIndexOf("\\") + 1);
}

const MIMES: Record<string, string> = {
	txt: "text/plain", md: "text/markdown", json: "application/json", js: "text/javascript", ts: "text/typescript",
	py: "text/x-python", ps1: "text/x-powershell", csv: "text/csv", log: "text/plain",
	pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml",
};

export function mimeFor(name: string): string {
	const ext = name.toLowerCase().split(".").pop() ?? "";
	return MIMES[ext] ?? "application/octet-stream";
}

export function isTextMime(mime: string): boolean {
	return mime.startsWith("text/") || mime === "application/json";
}

export class VirtualFs {
	root: FsNode = { kind: "dir", name: "C:", children: new Map(), modified: Date.now() };

	private walk(path: string): FsNode | undefined {
		const n = normalizePath(path);
		if (n === "C:\\") return this.root;
		let node: FsNode = this.root;
		for (const seg of n.slice(3).split("\\")) {
			if (node.kind !== "dir") return undefined;
			const next = [...node.children.values()].find((c) => c.name.toLowerCase() === seg.toLowerCase());
			if (!next) return undefined;
			node = next;
		}
		return node;
	}

	exists(path: string) { return this.walk(path) !== undefined; }
	stat(path: string) { return this.walk(path); }
	isDir(path: string) { return this.walk(path)?.kind === "dir"; }

	list(path: string): FsNode[] {
		const node = this.walk(path);
		if (!node || node.kind !== "dir") throw new Error(`Cannot find path '${normalizePath(path)}' because it does not exist.`);
		return [...node.children.values()].sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "dir" ? -1 : 1));
	}

	mkdir(path: string): void {
		const n = normalizePath(path);
		let node: FsNode = this.root;
		for (const seg of n.slice(3).split("\\")) {
			if (seg === "") continue;
			if (node.kind !== "dir") throw new Error(`'${node.name}' is a file`);
			let next = [...node.children.values()].find((c) => c.name.toLowerCase() === seg.toLowerCase());
			if (!next) {
				next = { kind: "dir", name: seg, children: new Map(), modified: Date.now() };
				node.children.set(seg.toLowerCase(), next);
			}
			node = next;
		}
	}

	read(path: string): FsNode & { kind: "file" } {
		const node = this.walk(path);
		if (!node) throw new Error(`Cannot find path '${normalizePath(path)}' because it does not exist.`);
		if (node.kind !== "file") throw new Error(`'${normalizePath(path)}' is a directory.`);
		return node;
	}

	readText(path: string): string {
		const f = this.read(path);
		return typeof f.data === "string" ? f.data : `[binary file, ${f.data.byteLength} bytes]`;
	}

	write(path: string, data: string | Uint8Array, mime?: string, href?: string): void {
		const n = normalizePath(path);
		this.mkdir(parentOf(n));
		const parent = this.walk(parentOf(n));
		if (!parent || parent.kind !== "dir") throw new Error("parent is not a directory");
		const name = baseName(n);
		parent.children.set(name.toLowerCase(), { kind: "file", name, data, mime: mime ?? mimeFor(name), modified: Date.now(), ...(href ? { href } : {}) });
		parent.modified = Date.now();
	}

	/** Find a file by name anywhere on the drive (case-insensitive), for callers that only know the name. */
	find(name: string): string | null {
		const wanted = name.toLowerCase().replace(/^.*[\\/]/, "");
		const walk = (node: FsNode, prefix: string): string | null => {
			if (node.kind !== "dir") return null;
			for (const child of node.children.values()) {
				const full = prefix === "C:\\" ? `C:\\${child.name}` : `${prefix}\\${child.name}`;
				if (child.kind === "file" && child.name.toLowerCase() === wanted) return full;
				if (child.kind === "dir") {
					const hit = walk(child, full);
					if (hit) return hit;
				}
			}
			return null;
		};
		return walk(this.root, "C:\\");
	}

	remove(path: string): void {
		const n = normalizePath(path);
		const parent = this.walk(parentOf(n));
		if (!parent || parent.kind !== "dir" || !parent.children.has(baseName(n).toLowerCase())) {
			throw new Error(`Cannot find path '${n}' because it does not exist.`);
		}
		parent.children.delete(baseName(n).toLowerCase());
	}
}

/** The eight documents of the sample library, served from /library. Order and labels follow the corpus. */
export const LIBRARY_FILES: Array<{ file: string; folder: string }> = [
	{ file: "sample-cil-annual-report-2023-24-excerpt.pdf", folder: "Reports" },
	{ file: "sample-provisional-coal-statistics-2023-24.pdf", folder: "Reports" },
	{ file: "sample-pib-press-release-april-2024.pdf", folder: "Reports" },
	{ file: "sample-scanned-coal-directory-2018-19-p42.pdf", folder: "Reports" },
	{ file: "sample-subsidiary-production-2019-24.xlsx", folder: "Reports" },
	{ file: "sample-ls-usq-2150-29-07-2024.pdf", folder: "Parliament replies" },
	{ file: "sample-ls-usq-3021-10-03-2025.pdf", folder: "Parliament replies" },
	{ file: "sample-rs-usq-1187-05-12-2024.pdf", folder: "Parliament replies" },
];


const README = [
	"CMPDI Workstation - officer account (demo build).",
	"",
	"Stratum is installed under Program Files. The sample library is under Documents/Library:",
	"eight coal documents (reports, statistics, past Parliament replies) that Stratum has already read.",
	"Drafts and reports Stratum produces are written to Documents/Deliverables.",
	"",
	"This is a demoable version: the documents are samples, and the library is fixed.",
	"",
].join("\r\n");

const ABOUT = [
	"Stratum - document intelligence for CMPDI and Coal India.",
	"This demo build reaches hosted open-weight models through the Groq API; the product itself runs local models on the officer's machine.",
	"",
].join("\r\n");

/** Build the seeded workstation. */
export function seedFs(): VirtualFs {
	const fs = new VirtualFs();
	const docs = `${HOME}\\Documents`;
	for (const d of ["Desktop", "Documents", "Pictures", "Downloads", "Documents\\Library\\Reports", "Documents\\Library\\Parliament replies", "Documents\\Parliament questions", "Documents\\Deliverables"]) {
		fs.mkdir(`${HOME}\\${d}`);
	}
	fs.mkdir("C:\\Windows\\System32");
	fs.mkdir("C:\\Program Files\\Stratum");
	for (const { file, folder } of LIBRARY_FILES) {
		fs.write(`${docs}\\Library\\${folder}\\${file}`, "", undefined, `/library/${file}`);
	}
	fs.write(`${docs}\\Parliament questions\\LS-USQ-sample-question.txt`, SAMPLE_PQ_TEXT);
	fs.write(`${docs}\\README.txt`, README);
	fs.write("C:\\Program Files\\Stratum\\ABOUT.txt", ABOUT);
	return fs;
}

