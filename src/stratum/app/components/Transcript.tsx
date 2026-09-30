import { useEffect, useRef, useState } from "react";
import { displayFor, PLANE_LABEL } from "../fleet";
import { useStratum, type Block, type Turn } from "../store";
import { Spinner, ToolCard } from "./Cards";
import { Markdown } from "./Markdown";
import { StateDot } from "./ui";

const TASK_LABEL: Record<string, string> = { ask: "Ask", pq_reply: "PQ reply", report: "Report", topics: "Topics", vision: "Page reader", chat: "Chat", web: "Web" };

export function Transcript({ turns }: { turns: Turn[] }) {
	const endRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
	}, [turns]);
	return (
		<div className="scroll" style={{ flex: 1, overflowY: "auto", padding: "24px 0 12px" }}>
			<div style={{ maxWidth: 880, margin: "0 auto", padding: "0 24px", display: "flex", flexDirection: "column", gap: 18 }}>
				{turns.map((t) => (t.role === "user" ? <UserTurn key={t.id} turn={t} /> : <AssistantTurn key={t.id} turn={t} />))}
				<div ref={endRef} />
			</div>
		</div>
	);
}

function UserTurn({ turn }: { turn: Extract<Turn, { role: "user" }> }) {
	const setPreviewImage = useStratum((s) => s.setPreviewImage);
	return (
		<div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
			{turn.image && (
				<img
					src={turn.image.url}
					alt="Attached page — click to preview"
					title="Click to preview"
					onClick={() => setPreviewImage(turn.image!.url)}
					style={{ maxHeight: 200, maxWidth: 320, borderRadius: 10, border: "1px solid var(--border-l1)", display: "block", cursor: "zoom-in", background: "#ffffff" }}
				/>
			)}
			<div style={{ background: "var(--bg-layer-2)", borderRadius: 18, padding: "10px 16px", fontSize: 15, lineHeight: 1.5, maxWidth: "80%", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{turn.text}</div>
		</div>
	);
}

function AssistantTurn({ turn }: { turn: Extract<Turn, { role: "assistant" }> }) {
	const lastBlock = turn.blocks[turn.blocks.length - 1];
	const waitingForProse = !turn.done && lastBlock?.type === "text" && lastBlock.text === "";
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 15, lineHeight: 1.6 }}>
			{turn.blocks.map((b, i) => (b.type === "text" && b.text === "" ? null : <BlockView key={i} block={b} />))}
			{!turn.done && turn.blocks.length === 0 && !turn.error && (
				<div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--label-tertiary)", fontSize: 13 }}>
					<Spinner /> {turn.member ? `${displayFor(turn.member)} is answering` : "Routing"}
				</div>
			)}
			{waitingForProse && (
				<div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--label-tertiary)", fontSize: 13 }}>
					<Spinner /> Writing the answer from the evidence
				</div>
			)}
			{turn.error && (
				<div style={{ color: "var(--error-primary)", fontSize: 13, border: "1px solid var(--error-primary)", borderRadius: 8, padding: "8px 12px" }}>The model plane did not answer: {turn.error}</div>
			)}
			{turn.done && !turn.error && turn.member && (
				<div style={{ fontSize: 11.5, color: "var(--label-tertiary)", display: "flex", gap: 6, alignItems: "center" }}>
					<StateDot state="done" size={6} />
					{turn.taskType ? `${TASK_LABEL[turn.taskType] ?? turn.taskType} · ` : ""}
					{turn.taskType === "ask" || turn.taskType === "pq_reply" || turn.taskType === "report" || turn.taskType === "topics"
						? `figures looked up in the library, not generated · ${displayFor(turn.member)} via the ${PLANE_LABEL} for wording only`
						: `${displayFor(turn.member)} · hosted through the ${PLANE_LABEL}`}
				</div>
			)}
		</div>
	);
}

function BlockView({ block }: { block: Block }) {
	switch (block.type) {
		case "text":
			return <Markdown text={block.text} />;
		case "thinking":
			return <Thinking text={block.text} />;
		case "note":
			return (
				<div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, lineHeight: 1.5, color: block.tone === "warn" ? "var(--warn-label)" : "var(--label-secondary)" }}>
					<StateDot state={block.tone === "warn" ? "warning" : "done"} size={7} style={{ marginTop: 6 }} />
					{block.text}
				</div>
			);
		case "card":
			return <ToolCard block={block} />;
		case "tool":
			return <ToolRow block={block} />;
	}
}

function Thinking({ text }: { text: string }) {
	const [open, setOpen] = useState(false);
	return (
		<div style={{ fontSize: 12.5, color: "var(--label-secondary)" }}>
			<button onClick={() => setOpen((v) => !v)} aria-expanded={open} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--label-secondary)" }}>
				<span aria-hidden style={{ display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform 120ms ease", fontSize: 10 }}>{"▸"}</span>
				Reasoning
			</button>
			{open && <div style={{ marginTop: 6, paddingLeft: 16, borderLeft: "2px solid var(--border-l2)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{text}</div>}
		</div>
	);
}

function ToolRow({ block }: { block: Extract<Block, { type: "tool" }> }) {
	const [open, setOpen] = useState(false);
	const state = block.status === "running" ? null : block.status === "done" ? "done" : block.status === "denied" ? "error" : "warning";
	return (
		<div style={{ fontSize: 13 }}>
			<button onClick={() => setOpen((v) => !v)} aria-expanded={open} style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--label-secondary)", textAlign: "left", maxWidth: "100%" }}>
				{state ? <StateDot state={state} size={8} /> : <Spinner />}
				<span style={{ color: "var(--label-primary)" }}>Tool call</span>
				<span aria-hidden>·</span>
				<span className="mono" style={{ fontSize: 12 }}>{block.name} ·</span>
				<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 480 }}>{String(block.input.url ?? "")}</span>
				{block.status === "denied" && <span style={{ color: "var(--error-primary)", fontWeight: 500 }}>Denied</span>}
			</button>
			{open && block.result !== undefined && (
				<pre className="mono scroll" style={{ marginTop: 6, padding: "8px 10px", background: "var(--bg-layer-2)", border: "1px solid var(--border-l1)", borderRadius: 8, fontSize: 12, whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 240, overflow: "auto" }}>{block.result}</pre>
			)}
		</div>
	);
}
