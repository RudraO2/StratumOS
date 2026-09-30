/**
 * Ready-made material for a first visit: prompts that walk the demo path (taken from the engine, where each
 * one is run against the library before it is listed) and one sample page image for the attach menu.
 */
import { SAMPLE_QUESTIONS } from "../engine";
import type { PendingImage } from "./store";

export interface SampleImage {
	id: string;
	label: string;
	hint: string;
	source: string;
	mediaType: "image/png" | "image/jpeg";
}

export const SAMPLE_IMAGES: SampleImage[] = [
	{ id: "scanned-directory", label: "Sample scan — coal directory, page 42", hint: "A scanned page of a coal directory: a table with no text layer", source: "/samples/scanned-coal-directory-p42.jpg", mediaType: "image/jpeg" },
];

export interface SuggestedPrompt {
	label: string;
	text: string;
	image?: string;
}

/** The engine's questions, then the two that need the rest of the workstation. */
export const SUGGESTED_PROMPTS: SuggestedPrompt[] = [
	...SAMPLE_QUESTIONS.map((q) => ({ label: q.label, text: q.text })),
	{ label: "Read a scanned page", text: "Read this page and list the figures in its table.", image: "scanned-directory" },
	{ label: "Try to reach the internet", text: "Open the Coal India website, https://www.coalindia.in, and check the latest production figures." },
];

const MAX_EDGE = 1280;

async function bitmapToPending(bitmap: ImageBitmap, mediaType: "image/png" | "image/jpeg"): Promise<PendingImage> {
	const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
	const canvas = document.createElement("canvas");
	canvas.width = Math.max(1, Math.round(bitmap.width * scale));
	canvas.height = Math.max(1, Math.round(bitmap.height * scale));
	const g = canvas.getContext("2d")!;
	g.fillStyle = "#ffffff";
	g.fillRect(0, 0, canvas.width, canvas.height);
	g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	const url = canvas.toDataURL(mediaType, 0.9);
	return { url, mediaType, base64: url.slice(url.indexOf(",") + 1) };
}

/** Resize an officer's file to the model's budget and return base64 + a preview URL. */
export async function prepareImageFile(file: File): Promise<PendingImage> {
	const bitmap = await createImageBitmap(file);
	return bitmapToPending(bitmap, file.type === "image/jpeg" ? "image/jpeg" : "image/png");
}

export async function loadSample(id: string): Promise<PendingImage> {
	const sample = SAMPLE_IMAGES.find((s) => s.id === id);
	if (!sample) throw new Error(`no sample "${id}"`);
	const blob = await (await fetch(sample.source)).blob();
	return bitmapToPending(await createImageBitmap(blob), sample.mediaType);
}
