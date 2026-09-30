/**
 * Does this site allow itself to be shown inside another page? The in-OS
 * browser asks before it decides between a direct iframe (the request leaves
 * the judge's own tab) and the page relay (`proxy.ts`).
 */
import { fetchLikeABrowser, json, parseTarget, refusesFraming } from "./_relay.js";

async function handler(req: Request): Promise<Response> {
	const target = parseTarget(new URL(req.url).searchParams.get("url"));
	if (!target) return json({ error: "url must be an absolute http(s) address on the public web" }, 400);
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 8000);
	try {
		const response = await fetchLikeABrowser(target, { signal: controller.signal });
		// Only the headers matter; drop the body.
		try {
			await response.body?.cancel();
		} catch {
			/* already closed */
		}
		return json({ ok: true, status: response.status, framable: !refusesFraming(response.headers), finalUrl: response.url, contentType: response.headers.get("content-type") ?? "" });
	} catch (error) {
		return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 200);
	} finally {
		clearTimeout(timer);
	}
}

/** Vercel reads a default-exported *function* as the Node (req, res) signature; the
 *  `{ fetch }` object is what selects the web-standard Request/Response handler. */
export default { fetch: handler };
