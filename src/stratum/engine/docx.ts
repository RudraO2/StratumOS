/**
 * A small `.docx` writer for PQ replies and reports (the role python-docx plays in backend/stratum/docx_out.py).
 * Hand-written OOXML with direct formatting only — no styles part — the same minimal package the approval-note
 * builder uses, which Word and LibreOffice both open clean. Zip container via fflate.
 */
import { zipSync } from "fflate";
import type { Citation } from "./types.ts";

const utf8 = (s: string) => new TextEncoder().encode(s);
const esc = (v: unknown) => String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
const CITE = /\s*\[(\d+)\]/g;

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

interface RunOpts {
	bold?: boolean;
	italic?: boolean;
	size?: number; // points
	color?: string;
}

const run = (text: string, { bold, italic, size = 12, color }: RunOpts = {}) =>
	`<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>${bold ? "<w:b/>" : ""}${italic ? "<w:i/>" : ""}${color ? `<w:color w:val="${color}"/>` : ""}<w:sz w:val="${size * 2}"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;

const para = (inner: string, jc?: string, after = 120) => `<w:p><w:pPr>${jc ? `<w:jc w:val="${jc}"/>` : ""}<w:spacing w:after="${after}"/></w:pPr>${inner}</w:p>`;

export class DocxBuilder {
	private body: string[] = [];
	title = "Stratum document";

	/** python `docx_out.centered` */
	centered(text: string, { bold = true, size = 12 }: { bold?: boolean; size?: number } = {}) {
		this.body.push(para(run(text, { bold, size }), "center", 40));
	}

	/** python `docx_out.paragraph`: one paragraph per line, citation markers stripped unless asked to keep them. */
	paragraph(text: string, { bold = false, italic = false, size, keepCitations = false }: { bold?: boolean; italic?: boolean; size?: number; keepCitations?: boolean } = {}) {
		for (const chunk of (text || "").split("\n")) {
			let line = keepCitations ? chunk : chunk.replace(CITE, "");
			line = line.replaceAll("**", "");
			if (!line.trim()) continue;
			if (line.trimStart().startsWith("- ")) line = "• " + line.trimStart().slice(2);
			this.body.push(para(run(line, { bold, italic, size }), "both"));
		}
	}

	blank() {
		this.body.push(para("", undefined, 0));
	}

	pageBreak() {
		this.body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
	}

	heading(text: string, color?: string) {
		this.body.push(para(run(text, { bold: true, color }), undefined, 120));
	}

	table(header: string[], rows: string[][], title?: string) {
		if (title) this.centered(title, { bold: true });
		const border = (side: string) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="808080"/>`;
		const cell = (text: string, bold: boolean) => `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>${para(run(String(text), { bold, size: 11 }), undefined, 0)}</w:tc>`;
		const tr = (cells: string[], bold: boolean) => `<w:tr>${cells.map((c) => cell(c, bold)).join("")}</w:tr>`;
		this.body.push(
			`<w:tbl><w:tblPr><w:jc w:val="center"/><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(border).join("")}</w:tblBorders></w:tblPr>` +
				`<w:tblGrid>${header.map(() => '<w:gridCol w:w="1800"/>').join("")}</w:tblGrid>${tr(header, true)}${rows.map((r) => tr(r, false)).join("")}</w:tbl>`,
		);
		this.blank();
	}

	/** python `docx_out.evidence_section` */
	evidenceSection(citations: Citation[], heading = "Evidence trail (internal — remove before dispatch)") {
		if (citations.length === 0) return;
		this.pageBreak();
		this.heading(heading, "804000");
		for (const c of citations) {
			const where = c.page_no ? `page ${c.page_no}` : "";
			const status = c.status ? ` · ${c.status}` : "";
			this.paragraph(`[${c.n}] ${c.filename} ${where}${status} — ${(c.snippet ?? "").slice(0, 300)}`, { keepCitations: true, size: 9 });
		}
	}

	build(generatedAt = new Date()): Uint8Array {
		const iso = generatedAt.toISOString();
		const documentXml =
			'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
			'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
			this.body.join("") +
			'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1304" w:bottom="1440" w:left="1304" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>';
		const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
		const contentTypes =
			`${head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
			'<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
			'<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
			'<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';
		const rels =
			`${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
			'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
			'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
			'<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>';
		const core =
			`${head}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
			`<dc:title>${esc(this.title)}</dc:title><dc:creator>Stratum (demo)</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created></cp:coreProperties>`;
		const app = `${head}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Stratum</Application></Properties>`;
		return zipSync(
			{
				"[Content_Types].xml": utf8(contentTypes),
				"_rels/.rels": utf8(rels),
				"docProps/core.xml": utf8(core),
				"docProps/app.xml": utf8(app),
				"word/document.xml": utf8(documentXml),
			},
			{ level: 6, mtime: generatedAt },
		);
	}
}

/** An Ask answer table → header + rows for DOCX (docx_out.table_rows). */
export function tableRows(t: { kind: string; periods: string[]; show_change: boolean; change_label: string; rows: Array<{ entity: string; cells: Array<{ display: string; provisional: boolean } | null>; change_pct: number | null }> }): [string[], string[][]] {
	const achievement = t.kind === "achievement";
	const header = ["Entity", ...t.periods, ...(t.show_change ? [(t.change_label || "Change %").replace("%", "(%)")] : [])];
	const rows = t.rows.map((row) => {
		const cells = row.cells.map((c) => (c ? c.display + (c.provisional ? " (P)" : "") : "—"));
		const pct = row.change_pct;
		const extra = t.show_change ? [pct === null ? "—" : achievement ? pct.toFixed(2) : (pct >= 0 ? "+" : "") + pct.toFixed(2)] : [];
		return [row.entity, ...cells, ...extra];
	});
	return [header, rows];
}

/** Word-safe deliverable file name (docx_out.save with a caller-chosen name). */
export const safeName = (stem: string) => {
	const cleaned = stem.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "stratum";
	return cleaned.toLowerCase().endsWith(".docx") ? cleaned : `${cleaned}.docx`;
};
