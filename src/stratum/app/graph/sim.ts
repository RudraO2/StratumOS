/** A small force layout: nodes repel, links pull to a rest length, the whole thing is drawn toward the centre. */
import type { GEdge, GNode, Graph } from "./model";

const REST: Record<GEdge["kind"], number> = { supports: 200, covers: 170, about: 170, conflict: 260 };
const STRENGTH: Record<GEdge["kind"], number> = { supports: 0.035, covers: 0.03, about: 0.05, conflict: 0.004 };

export class Sim {
	alpha = 1;
	constructor(private graph: Graph) {}

	get settled() {
		return this.alpha < 0.012;
	}

	reheat(to = 0.5) {
		this.alpha = Math.max(this.alpha, to);
	}

	tick() {
		const { nodes, edges, byId } = this.graph;
		const a = this.alpha;
		for (let i = 0; i < nodes.length; i += 1) {
			const p = nodes[i];
			for (let j = i + 1; j < nodes.length; j += 1) {
				const q = nodes[j];
				let dx = q.x - p.x;
				let dy = q.y - p.y;
				let d2 = dx * dx + dy * dy;
				if (d2 < 1) {
					dx = Math.random() - 0.5;
					dy = Math.random() - 0.5;
					d2 = 1;
				}
				const d = Math.sqrt(d2);
				const force = (11000 * (p.r + q.r)) / 40 / d2;
				const fx = (dx / d) * force * a;
				const fy = (dy / d) * force * a;
				p.vx -= fx;
				p.vy -= fy;
				q.vx += fx;
				q.vy += fy;
				const min = p.r + q.r + 46;
				if (d < min) {
					const push = ((min - d) / d) * 0.5 * a;
					p.vx -= dx * push;
					p.vy -= dy * push;
					q.vx += dx * push;
					q.vy += dy * push;
				}
			}
		}
		for (const e of edges) {
			const p = byId.get(e.a);
			const q = byId.get(e.b);
			if (!p || !q) continue;
			const dx = q.x - p.x;
			const dy = q.y - p.y;
			const d = Math.sqrt(dx * dx + dy * dy) || 1;
			const pull = ((d - REST[e.kind]) / d) * STRENGTH[e.kind] * a * (1 + Math.min(1.5, Math.log2(1 + e.w) * 0.25));
			p.vx += dx * pull;
			p.vy += dy * pull;
			q.vx -= dx * pull;
			q.vy -= dy * pull;
		}
		for (const n of nodes) {
			n.vx -= n.x * 0.006 * a;
			n.vy -= n.y * 0.006 * a;
			if (n.pinned) {
				n.vx = 0;
				n.vy = 0;
				continue;
			}
			n.vx *= 0.8;
			n.vy *= 0.8;
			n.x += n.vx;
			n.y += n.vy;
		}
		this.alpha *= 0.985;
	}

	/** Run the layout ahead of time so the first frame is already settled. */
	settle(ticks = 260) {
		for (let i = 0; i < ticks; i += 1) this.tick();
	}
}

export function bounds(nodes: GNode[]) {
	let x0 = Infinity;
	let y0 = Infinity;
	let x1 = -Infinity;
	let y1 = -Infinity;
	for (const n of nodes) {
		x0 = Math.min(x0, n.x - n.r);
		y0 = Math.min(y0, n.y - n.r);
		x1 = Math.max(x1, n.x + n.r);
		y1 = Math.max(y1, n.y + n.r);
	}
	return { x0, y0, x1, y1 };
}
