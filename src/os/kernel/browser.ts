import { create } from "zustand";

export interface Tab {
	id: number;
	url: string;
	title: string;
	history: string[];
	index: number;
	loadedAt: number;
}

interface BrowserState {
	tabs: Tab[];
	active: number | null;
	openTab(url?: string): number;
	closeTab(id: number): void;
	setActive(id: number): void;
	navigate(id: number, url: string): void;
	back(id: number): void;
	forward(id: number): void;
	reload(id: number): void;
}

export const HOME_URL = "about:home";
let tabCounter = 0;

export function normalizeUrl(input: string): string {
	const t = input.trim();
	if (t === "" || t === HOME_URL) return HOME_URL;
	// A path on this site (a library document) is not a web address.
	if (t.startsWith("/") && !t.startsWith("//")) return window.location.origin + t;
	if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return t;
	if (/^[\w.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(t) || /^localhost/i.test(t)) return "https://" + t;
	// Bing: allows embedding and renders results server-side. Google forbids embedding and
	// serves only a JavaScript shell to a relay, so its results cannot be shown in a frame.
	return "https://www.bing.com/search?q=" + encodeURIComponent(t);
}

export function titleFor(url: string): string {
	if (url === HOME_URL) return "New tab";
	try {
		return new URL(url).host.replace(/^www\./, "");
	} catch {
		return url;
	}
}

export const useBrowser = create<BrowserState>((set, get) => ({
	tabs: [],
	active: null,
	openTab: (url = HOME_URL) => {
		const u = normalizeUrl(url);
		const id = ++tabCounter;
		set((s) => ({ tabs: [...s.tabs, { id, url: u, title: titleFor(u), history: [u], index: 0, loadedAt: Date.now() }], active: id }));
		return id;
	},
	closeTab: (id) =>
		set((s) => {
			const tabs = s.tabs.filter((t) => t.id !== id);
			const active = s.active === id ? (tabs[tabs.length - 1]?.id ?? null) : s.active;
			return { tabs, active };
		}),
	setActive: (id) => set({ active: id }),
	navigate: (id, url) => {
		const u = normalizeUrl(url);
		set((s) => ({
			tabs: s.tabs.map((t) =>
				t.id === id ? { ...t, url: u, title: titleFor(u), history: [...t.history.slice(0, t.index + 1), u], index: t.index + 1, loadedAt: Date.now() } : t,
			),
		}));
	},
	back: (id) =>
		set((s) => ({
			tabs: s.tabs.map((t) => (t.id === id && t.index > 0 ? { ...t, index: t.index - 1, url: t.history[t.index - 1], title: titleFor(t.history[t.index - 1]), loadedAt: Date.now() } : t)),
		})),
	forward: (id) =>
		set((s) => ({
			tabs: s.tabs.map((t) =>
				t.id === id && t.index < t.history.length - 1 ? { ...t, index: t.index + 1, url: t.history[t.index + 1], title: titleFor(t.history[t.index + 1]), loadedAt: Date.now() } : t,
			),
		})),
	reload: (id) => set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, loadedAt: Date.now() } : t)) })),
	// expose for executors
	...({} as Record<string, never>),
}));

export const browser = { get: () => useBrowser.getState() };
