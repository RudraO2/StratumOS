/**
 * Where a tool call lands on the workstation.
 *
 * Stratum's four tools run the engine over the sample library and never leave the page; the lanes in
 * `turn.ts` call them from the officer's own words. `browser_open` is the one tool that reaches outside,
 * so the seal's denial waterfall runs here BEFORE anything opens, as the product's `tools/pre-execute` does.
 */
import { browser } from "../../os/kernel/browser";
import { HOME } from "../../os/kernel/fs";
import { launch } from "../../os/kernel/launch";
import { os } from "../../os/kernel/store";
import { guardCheck, library, runTool, type ToolName, type ToolResult } from "../engine";
import { describeTarget, EGRESS_DENIED_EVENT, NETWORK_TOOL_NAMES, PERMITTED_EVENT } from "./lib/egress/policy.js";
import { isSealed } from "./lib/egress/seal.js";
import { recordTool } from "./lib/trace/turn.js";
import { stratum } from "./store";

export interface WebOutcome {
	content: string;
	isError?: boolean;
	status: "done" | "denied" | "error";
}

/** browser_open, the tool the seal governs. */
export async function executeWebTool(name: string, input: Record<string, unknown>): Promise<WebOutcome> {
	const { appendEvent } = stratum.get();
	if (NETWORK_TOOL_NAMES.has(name)) {
		const target = describeTarget(input);
		if (isSealed()) {
			appendEvent(EGRESS_DENIED_EVENT, { tool: name, target });
			os.toast({ title: "Outbound call denied.", body: `${name} → ${target}`, tone: "error" });
			recordTool(name, { outcome: "denied by the seal" });
			return { content: `Stratum denies outbound network access: "${name}" attempted to reach ${target}`, isError: true, status: "denied" };
		}
		appendEvent(PERMITTED_EVENT, { tool: name, target });
	}
	if (name === "browser_open") {
		const url = String(input.url ?? "");
		launch("browser");
		browser.get().openTab(url);
		recordTool(name, { outcome: `opened ${url}` });
		return { content: `Opened ${url} in the workstation's browser. The page is on screen; you cannot read its contents from here.`, status: "done" };
	}
	return { content: `Unknown tool "${name}".`, isError: true, status: "error" };
}

/** The lane's synthetic call: the tool and its input, built from the officer's own words. */
export function laneCall(taskType: string, text: string): { tool: ToolName; input: Record<string, unknown> } | null {
	switch (taskType) {
		case "ask":
			return { tool: "stratum_ask", input: { question: text } };
		case "pq_reply":
			return { tool: "stratum_pq_reply", input: { text } };
		case "report":
			return { tool: "stratum_report", input: { request: text } };
		case "topics":
			return { tool: "stratum_topics", input: {} };
		default:
			return null;
	}
}

export interface LaneOutcome {
	result: ToolResult;
	produced?: { path: string; name: string };
}

/** Run one of Stratum's tools and, when it made a document, write it to Documents\Deliverables. */
export function executeStratumTool(tool: ToolName, input: Record<string, unknown>): LaneOutcome {
	const result = runTool(tool, input);
	recordTool(tool, { outcome: result.ok ? "done" : "no answer" });
	let produced: LaneOutcome["produced"];
	if (result.deliverable) {
		const dir = `${HOME}\\Documents\\Deliverables`;
		const path = `${dir}\\${result.deliverable.name}`;
		os.get().fs.write(path, result.deliverable.bytes, result.deliverable.mime);
		os.touchFs();
		produced = { path, name: result.deliverable.name };
		os.toast({ title: "Deliverable produced.", body: result.deliverable.name, tone: "done" });
	}
	return { result, produced };
}

/**
 * A page read by the vision model, checked against the library: how many of the figures it transcribed
 * are a verified figure Stratum already holds. Says nothing about a figure the library does not have.
 */
export function crossCheckPage(text: string): { checked: number; matched: number } {
	const values = library.facts().map((f) => f.value);
	const verdict = guardCheck(text, values);
	return { checked: verdict.checked, matched: verdict.checked - verdict.unsupported.length };
}
