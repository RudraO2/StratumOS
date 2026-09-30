import { useEffect, useRef, useState } from "react";
import type { AppProps } from "../kernel/apps";
import { useShell } from "../kernel/shell";

export function Terminal(_: AppProps) {
	const { lines, cwd, busy, run, history } = useShell();
	const [input, setInput] = useState("");
	const [histIdx, setHistIdx] = useState<number | null>(null);
	const endRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		endRef.current?.scrollIntoView({ block: "end" });
	}, [lines, busy]);

	const submit = async () => {
		const cmd = input;
		setInput("");
		setHistIdx(null);
		await run(cmd);
		inputRef.current?.focus();
	};

	return (
		<div
			className="mono scroll"
			onClick={() => inputRef.current?.focus()}
			style={{ flex: 1, background: "#0c0c0c", color: "#cccccc", padding: "8px 12px", fontSize: 13, lineHeight: 1.45, whiteSpace: "pre-wrap", overflowWrap: "anywhere", cursor: "text" }}
		>
			{lines.map((l) => (
				<div key={l.id} style={{ color: l.kind === "error" ? "#f14c4c" : l.kind === "prompt" ? "#ffffff" : "#cccccc" }}>
					{l.kind === "prompt" ? (
						<>
							<span style={{ color: "#dcdcaa" }}>{l.text.slice(0, l.text.indexOf("> ") + 2)}</span>
							{l.text.slice(l.text.indexOf("> ") + 2)}
						</>
					) : (
						l.text
					)}
				</div>
			))}
			{!busy && (
				<div style={{ display: "flex" }}>
					<span style={{ color: "#dcdcaa" }}>PS {cwd}&gt; </span>
					<input
						ref={inputRef}
						autoFocus
						value={input}
						spellCheck={false}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") void submit();
							else if (e.key === "ArrowUp") {
								e.preventDefault();
								const idx = histIdx === null ? history.length - 1 : Math.max(0, histIdx - 1);
								if (history[idx] !== undefined) {
									setInput(history[idx]);
									setHistIdx(idx);
								}
							} else if (e.key === "ArrowDown") {
								e.preventDefault();
								if (histIdx === null) return;
								const idx = histIdx + 1;
								if (idx >= history.length) {
									setInput("");
									setHistIdx(null);
								} else {
									setInput(history[idx]);
									setHistIdx(idx);
								}
							}
						}}
						aria-label="Command"
						style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#ffffff", font: "inherit", padding: 0 }}
					/>
				</div>
			)}
			<div ref={endRef} />
		</div>
	);
}
