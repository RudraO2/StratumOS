/**
 * Prompts that walk the demo path. Each one is run against the engine in test/engine.test.ts, so a sample that
 * stops working when the snapshot or the rules change fails the suite rather than a visitor.
 */
export interface SampleQuestion {
	label: string;
	text: string;
	kind: "ask" | "pq" | "report" | "topics";
	/** What the visitor should notice. */
	shows: string;
}

export const SAMPLE_PQ_TEXT = [
	"LOK SABHA",
	"UNSTARRED QUESTION NO. 1234",
	"TO BE ANSWERED ON 05.08.2025",
	"COAL PRODUCTION BY SECL",
	"Will the Minister of COAL be pleased to state:",
	"(a) the coal production of South Eastern Coalfields Limited during the last three years;",
	"(b) whether the production target was achieved in 2023-24; and",
	"(c) the steps taken to improve evacuation?",
].join("\n");

export const SAMPLE_QUESTIONS: SampleQuestion[] = [
	{ label: "Subsidiary-wise production", text: "Give subsidiary-wise coal production for 2022-23 and 2023-24", kind: "ask", shows: "A table of verified facts, each figure cited to its source cell, with the change computed by code." },
	{ label: "Compare two subsidiaries", text: "Compare coal offtake of MCL and NCL between 2022-23 and 2023-24", kind: "ask", shows: "Offtake for two subsidiaries over two years, with the year-on-year change." },
	{ label: "Was the target met?", text: "Did SECL achieve its production target in 2023-24?", kind: "ask", shows: "Target and actual side by side; the verdict and shortfall are arithmetic, not model prose." },
	{ label: "Who exceeded their target?", text: "Which subsidiaries exceeded their production target in 2023-24?", kind: "ask", shows: "Target vs actual for every subsidiary." },
	{ label: "Why did output rise?", text: "Why did coal production of CIL increase in 2023-24?", kind: "ask", shows: "Figures from the fact table plus the reasons from the documents; every number is checked by the guard." },
	{ label: "Ask in Hindi", text: "एसईसीएल का 2023-24 में कोयला उत्पादन कितना था?", kind: "ask", shows: "A Devanagari question answered from the same facts." },
	{ label: "Ask in Hinglish", text: "SECL ka 2022-23 mein utpadan kitna tha?", kind: "ask", shows: "Romanised Hindi is understood too." },
	{ label: "Policy question", text: "What steps has the Government taken to reduce coal imports?", kind: "ask", shows: "Answered from the documents only, with passage citations." },
	{ label: "Something it cannot answer", text: "What is the coal production of Mars Colony in 2024?", kind: "ask", shows: "The refusal: no verified evidence, so no invented figure." },
	{ label: "Draft a Parliament reply", text: SAMPLE_PQ_TEXT, kind: "pq", shows: "A three-part Lok Sabha reply, and a review note that 187 differs from the 186.9 told to the House in an earlier reply." },
	{ label: "Report: target vs achievement", text: "Generate the production target vs achievement report for 2023-24", kind: "report", shows: "A report from a template, narrative stated from the verified table." },
	{ label: "Report: subsidiary-wise production", text: "Generate the subsidiary-wise annual production and offtake report", kind: "report", shows: "Two verified tables, a chart series and passages of context." },
	{ label: "Report: CIL production trend", text: "Generate a coal production trend report for Coal India over the last 5 years", kind: "report", shows: "A multi-year trend with explanatory evidence." },
	{ label: "What is in the library?", text: "What topics are covered in the library?", kind: "topics", shows: "Topics and a term cloud discovered across the documents." },
];
