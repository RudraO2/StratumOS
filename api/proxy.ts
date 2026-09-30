/**
 * The page relay. Fetches a public page on the workstation's behalf, strips
 * the headers that forbid embedding, anchors relative assets to the real
 * origin, and teaches links inside the page to navigate the in-OS browser
 * rather than the iframe. Sites that need a login, a websocket, or their own
 * origin's JavaScript (WhatsApp Web, Gmail) will not work through any relay;
 * the page says so instead of showing a blank frame.
 */
import { fetchLikeABrowser, parseTarget } from "./_relay.js";

const STRIP = ["content-security-policy", "content-security-policy-report-only", "x-frame-options", "content-encoding", "content-length", "transfer-encoding", "set-cookie", "strict-transport-security"];

const INJECT = (origin: string) => `<script data-stratum-relay>
(function () {
  var relay = "/api/proxy?url=";
  function toAbs(href) { try { return new URL(href, ${JSON.stringify(origin)}).href; } catch (e) { return null; } }
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a) return;
    var abs = toAbs(a.getAttribute("href"));
    if (!abs || !/^https?:/.test(abs)) return;
    e.preventDefault();
    parent.postMessage({ type: "stratum-navigate", url: abs }, "*");
  }, true);
  document.addEventListener("submit", function (e) {
    var f = e.target;
    if (!f || f.method && f.method.toLowerCase() === "post") return;
    var abs = toAbs(f.getAttribute("action") || location.href);
    if (!abs) return;
    e.preventDefault();
    var u = new URL(abs);
    var data = new FormData(f);
    data.forEach(function (v, k) { u.searchParams.set(k, String(v)); });
    parent.postMessage({ type: "stratum-navigate", url: u.href }, "*");
  }, true);
})();
</script>`;

function blocked(target: URL, reason: string): Response {
	const html = `<!doctype html><html><head><meta charset="utf-8"><title>${target.host}</title>
<style>body{font-family:system-ui,Segoe UI,sans-serif;background:#f6f6f6;color:#222;display:grid;place-items:center;height:100vh;margin:0}main{max-width:520px;padding:32px;text-align:center}h1{font-size:20px;margin:0 0 8px}p{color:#555;line-height:1.5;margin:6px 0}code{background:#eee;padding:2px 6px;border-radius:4px}</style></head>
<body><main><h1>${target.host} can't be shown here</h1><p>${reason}</p><p>The request did leave this workstation and is recorded on the egress monitor; what came back cannot be rendered inside another page.</p></main></body></html>`;
	return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

async function handler(req: Request): Promise<Response> {
	const target = parseTarget(new URL(req.url).searchParams.get("url"));
	if (!target) return new Response("url must be an absolute http(s) address on the public web", { status: 400 });
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 15000);
	try {
		const upstream = await fetchLikeABrowser(target, { signal: controller.signal });
		const type = upstream.headers.get("content-type") ?? "application/octet-stream";
		const headers = new Headers();
		upstream.headers.forEach((value, key) => {
			if (!STRIP.includes(key.toLowerCase())) headers.set(key, value);
		});
		headers.set("cache-control", "no-store");
		headers.set("x-stratum-relay", "1");

		if (!type.includes("text/html")) {
			// Assets and downloads pass straight through.
			return new Response(upstream.body, { status: upstream.status, headers });
		}

		let html = await upstream.text();
		const finalUrl = upstream.url || target.href;
		if (upstream.status >= 400 && html.length < 200) {
			return blocked(target, `The site answered ${upstream.status}.`);
		}
		// Drop meta CSP and existing <base>, then anchor relative URLs to the real origin and add the link shim.
		html = html.replace(/<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi, "");
		html = html.replace(/<base\b[^>]*>/gi, "");
		const head = `<base href="${finalUrl.replace(/"/g, "&quot;")}">${INJECT(finalUrl)}`;
		if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, (m) => `${m}${head}`);
		else html = head + html;
		headers.set("content-type", "text/html; charset=utf-8");
		return new Response(html, { status: upstream.status, headers });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return blocked(target, message.includes("abort") ? "It did not answer within 15 seconds." : `It could not be fetched: ${message}.`);
	} finally {
		clearTimeout(timer);
	}
}

/** Vercel reads a default-exported *function* as the Node (req, res) signature; the
 *  `{ fetch }` object is what selects the web-standard Request/Response handler. */
export default { fetch: handler };
