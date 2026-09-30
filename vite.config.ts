import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Local stand-in for Vercel's `api/` directory: serves `api/turn.ts` through
 * the dev server so the whole demo path runs on `npm run dev`. Production is
 * the real Vercel function; this plugin never ships.
 */
function devApi(env: Record<string, string>): Plugin {
	return {
		name: "stratum-dev-api",
		configureServer(server) {
			Object.assign(process.env, env);
			server.middlewares.use(async (req, res, next) => {
				if (!req.url?.startsWith("/api/")) return next();
				const name = req.url.slice("/api/".length).split("?")[0];
				try {
					const mod = await server.ssrLoadModule(`/api/${name}.ts`);
					const chunks: Buffer[] = [];
					for await (const chunk of req) chunks.push(chunk as Buffer);
					const request = new Request(`http://localhost${req.url}`, {
						method: req.method,
						headers: req.headers as Record<string, string>,
						body: chunks.length ? Buffer.concat(chunks) : undefined,
					});
					const entry = mod.default;
					const response: Response = await (typeof entry === "function" ? entry(request) : entry.fetch(request));
					res.statusCode = response.status;
					response.headers.forEach((v, k) => res.setHeader(k, v));
					if (!response.body) return res.end();
					const reader = response.body.getReader();
					while (true) {
						const { value, done } = await reader.read();
						if (done) break;
						res.write(value);
					}
					res.end();
				} catch (error) {
					res.statusCode = 500;
					res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
				}
			});
		},
	};
}

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");
	return {
		plugins: [react(), tailwindcss(), devApi(env)],
		server: { port: 5173 },
	};
});
