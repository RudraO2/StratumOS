/**
 * The models of this build: two hosted open-weight models on Groq standing in for the product's two
 * local ones (Qwen3-4B for text, Qwen3-VL-2B for page images). Same shape as the product's registry,
 * so the router scores them the same way and the routing chip shows the working.
 */
export interface FleetMember {
	name: string;
	member: "text" | "vision";
	display: string;
	licence: string;
	modalities: string[];
	capabilities: string[];
}

export const FLEET: FleetMember[] = [
	{
		name: "openai/gpt-oss-20b",
		member: "text",
		display: "GPT-OSS 20B",
		licence: "Apache-2.0 (weights); hosted on Groq",
		modalities: ["text"],
		capabilities: ["document-understanding", "structured-output", "general-reasoning", "instruction-following", "multilingual", "tool-use"],
	},
	{
		name: "qwen/qwen3.8-27b",
		member: "vision",
		display: "Qwen3.8 27B",
		licence: "Apache-2.0 (weights); hosted on Groq",
		modalities: ["text", "image"],
		capabilities: ["visual-grounding", "document-understanding", "multilingual", "instruction-following", "general-reasoning"],
	},
];

export const PLANE_LABEL = "Groq API";

export function memberFor(name: string): "text" | "vision" {
	return FLEET.find((m) => m.name === name)?.member ?? "text";
}

export function displayFor(name: string): string {
	return FLEET.find((m) => m.name === name)?.display ?? name;
}
