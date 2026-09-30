import type { ReactNode } from "react";

/**
 * A deliberately small markdown renderer for model replies: paragraphs,
 * bullet and numbered lists, bold, inline code, fenced code. Nothing else —
 * the prompts ask for plain prose, this just keeps stray markup from showing raw.
 */
function inline(text: string, keyBase: string): ReactNode[] {
	const out: ReactNode[] = [];
	const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
	let last = 0;
	let m: RegExpExecArray | null;
	let i = 0;
	while ((m = re.exec(text))) {
		if (m.index > last) out.push(text.slice(last, m.index));
		const tok = m[0];
		if (tok.startsWith("**")) out.push(<strong key={`${keyBase}-b${i}`}>{tok.slice(2, -2)}</strong>);
		else out.push(<code key={`${keyBase}-c${i}`} className="mono" style={{ fontSize: "0.92em", background: "var(--bg-layer-2)", padding: "1px 5px", borderRadius: 4 }}>{tok.slice(1, -1)}</code>);
		last = m.index + tok.length;
		i += 1;
	}
	if (last < text.length) out.push(text.slice(last));
	return out;
}

export function Markdown({ text }: { text: string }) {
	const blocks: ReactNode[] = [];
	const lines = text.replace(/\r\n/g, "\n").split("\n");
	let i = 0;
	let k = 0;
	while (i < lines.length) {
		const line = lines[i];
		if (line.trim() === "") {
			i += 1;
			continue;
		}
		if (line.trim().startsWith("```")) {
			const code: string[] = [];
			i += 1;
			while (i < lines.length && !lines[i].trim().startsWith("```")) code.push(lines[i++]);
			i += 1;
			blocks.push(
				<pre key={k++} className="mono scroll" style={{ margin: "4px 0", padding: "8px 10px", background: "var(--bg-layer-2)", border: "1px solid var(--border-l1)", borderRadius: 8, fontSize: 12.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
					{code.join("\n")}
				</pre>,
			);
			continue;
		}
		const bullet = /^\s*[-*•]\s+/;
		const numbered = /^\s*\d+[.)]\s+/;
		if (bullet.test(line) || numbered.test(line)) {
			const ordered = numbered.test(line);
			const items: string[] = [];
			while (i < lines.length && (ordered ? numbered.test(lines[i]) : bullet.test(lines[i]))) {
				items.push(lines[i].replace(ordered ? numbered : bullet, ""));
				i += 1;
				// continuation lines indented under the item
				while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !bullet.test(lines[i]) && !numbered.test(lines[i])) items[items.length - 1] += " " + lines[i++].trim();
			}
			const Tag = ordered ? "ol" : "ul";
			blocks.push(
				<Tag key={k++} style={{ margin: "2px 0 2px 22px", padding: 0, display: "flex", flexDirection: "column", gap: 3 }}>
					{items.map((it, j) => (
						<li key={j}>{inline(it, `${k}-${j}`)}</li>
					))}
				</Tag>,
			);
			continue;
		}
		// paragraph: consecutive non-empty, non-list lines; headings are just bold lines
		const para: string[] = [];
		while (i < lines.length && lines[i].trim() !== "" && !bullet.test(lines[i]) && !numbered.test(lines[i]) && !lines[i].trim().startsWith("```")) para.push(lines[i++]);
		const joined = para.join("\n");
		const heading = /^#{1,6}\s+(.*)$/.exec(joined.trim());
		blocks.push(
			<p key={k++} style={{ margin: "2px 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontWeight: heading ? 600 : undefined }}>
				{inline(heading ? heading[1] : joined, `${k}`)}
			</p>,
		);
	}
	return <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{blocks}</div>;
}
