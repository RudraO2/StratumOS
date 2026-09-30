/**
 * The one tool the model itself may call in this build. Stratum's four tools (ask, PQ reply, report,
 * topics) are run by the lanes in the browser from the officer's own words, exactly as the product does,
 * so the model is never handed them. `browser_open` exists so the seal has something to refuse.
 */
export const TOOL_DEFINITIONS = [
	{
		name: "browser_open",
		description: "Open a URL in the workstation's browser. This reaches the network; the seal decides whether it may run.",
		input_schema: {
			type: "object",
			properties: { url: { type: "string", description: "Absolute URL, e.g. https://example.com" } },
			required: ["url"],
			additionalProperties: false,
		},
	},
];
