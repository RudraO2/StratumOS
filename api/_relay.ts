/**
 * Shared pieces of the page relay: URL checks, a browser-like fetch, and the
 * framability test. Underscore prefix keeps this out of Vercel's endpoints.
 */

export const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export function parseTarget(raw: string | null): URL | null {
	if (!raw) return null;
	try {
		const url = new URL(raw);
		if (url.protocol !== "http:" && url.protocol !== "https:") return null;
		const host = url.hostname.toLowerCase();
		// Never relay into loopback or private ranges — the relay is for the public web only.
		if (host === "localhost" || host.endsWith(".local") || /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host === "::1") return null;
		return url;
	} catch {
		return null;
	}
}

export function refusesFraming(headers: Headers): boolean {
	const xfo = (headers.get("x-frame-options") ?? "").toLowerCase();
	if (xfo.includes("deny") || xfo.includes("sameorigin")) return true;
	const csp = (headers.get("content-security-policy") ?? "").toLowerCase();
	if (csp.includes("frame-ancestors")) {
		const directive = csp.split(";").map((s) => s.trim()).find((s) => s.startsWith("frame-ancestors")) ?? "";
		if (!directive.includes("*")) return true;
	}
	return false;
}

export async function fetchLikeABrowser(url: URL, init: { method?: string; signal?: AbortSignal; accept?: string } = {}) {
	return fetch(url, {
		method: init.method ?? "GET",
		redirect: "follow",
		signal: init.signal,
		headers: {
			"user-agent": USER_AGENT,
			accept: init.accept ?? "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
			"accept-language": "en-IN,en;q=0.9",
		},
	});
}

export function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
