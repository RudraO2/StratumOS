import { create } from "zustand";
import { seedFs, VirtualFs } from "./fs";

export type Theme = "light" | "dark";

export interface WindowState {
	id: string;
	app: string;
	title: string;
	x: number;
	y: number;
	w: number;
	h: number;
	z: number;
	minimized: boolean;
	maximized: boolean;
	args?: Record<string, unknown>;
	/** bumped when a singleton is re-opened with new args */
	nonce: number;
}

export interface Toast {
	id: number;
	title: string;
	body: string;
	tone: "info" | "error" | "warning" | "done";
	at: number;
}

interface OsState {
	booted: boolean;
	theme: Theme;
	fs: VirtualFs;
	fsVersion: number;
	windows: WindowState[];
	focused: string | null;
	nextZ: number;
	startOpen: boolean;
	toasts: Toast[];
	setBooted(v: boolean): void;
	setTheme(t: Theme): void;
	touchFs(): void;
	openWindow(app: string, opts?: { title?: string; args?: Record<string, unknown>; w?: number; h?: number; singleton?: boolean }): string;
	closeWindow(id: string): void;
	focusWindow(id: string): void;
	minimizeWindow(id: string, v?: boolean): void;
	maximizeWindow(id: string, v?: boolean): void;
	moveWindow(id: string, x: number, y: number): void;
	resizeWindow(id: string, w: number, h: number): void;
	setTitle(id: string, title: string): void;
	setStartOpen(v: boolean): void;
	toast(t: Omit<Toast, "id" | "at">): void;
	dismissToast(id: number): void;
}

let counter = 0;
let toastCounter = 0;

const savedTheme = ((): Theme => {
	try {
		const t = localStorage.getItem("stratum.theme");
		if (t === "light" || t === "dark") return t;
	} catch {
		/* storage blocked */
	}
	return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
})();

export const TASKBAR_HEIGHT = 48;

export const useOS = create<OsState>((set, get) => ({
	booted: false,
	theme: savedTheme,
	fs: seedFs(),
	fsVersion: 0,
	windows: [],
	focused: null,
	nextZ: 10,
	startOpen: false,
	toasts: [],
	setBooted: (v) => set({ booted: v }),
	setTheme: (theme) => {
		try {
			localStorage.setItem("stratum.theme", theme);
		} catch {
			/* storage blocked */
		}
		set({ theme });
	},
	touchFs: () => set((s) => ({ fsVersion: s.fsVersion + 1 })),
	openWindow: (app, opts = {}) => {
		const s = get();
		if (opts.singleton) {
			const existing = s.windows.find((w) => w.app === app);
			if (existing) {
				set({
					windows: s.windows.map((w) =>
						w.id === existing.id ? { ...w, minimized: false, z: s.nextZ, args: opts.args ?? w.args, nonce: w.nonce + 1 } : w,
					),
					focused: existing.id,
					nextZ: s.nextZ + 1,
					startOpen: false,
				});
				return existing.id;
			}
		}
		const id = `${app}-${++counter}`;
		const vw = window.innerWidth;
		const vh = window.innerHeight - TASKBAR_HEIGHT;
		const w = Math.min(opts.w ?? 900, vw - 40);
		const h = Math.min(opts.h ?? 600, vh - 40);
		const offset = (s.windows.length % 6) * 28;
		const win: WindowState = {
			id,
			app,
			title: opts.title ?? app,
			args: opts.args,
			x: Math.max(16, Math.round((vw - w) / 2) + offset - 60),
			y: Math.max(12, Math.round((vh - h) / 2) + offset - 40),
			w,
			h,
			z: s.nextZ,
			minimized: false,
			maximized: false,
			nonce: 0,
		};
		set({ windows: [...s.windows, win], focused: id, nextZ: s.nextZ + 1, startOpen: false });
		return id;
	},
	closeWindow: (id) =>
		set((s) => {
			const windows = s.windows.filter((w) => w.id !== id);
			const top = windows.filter((w) => !w.minimized).sort((a, b) => b.z - a.z)[0];
			return { windows, focused: s.focused === id ? (top?.id ?? null) : s.focused };
		}),
	focusWindow: (id) =>
		set((s) => ({
			windows: s.windows.map((w) => (w.id === id ? { ...w, z: s.nextZ, minimized: false } : w)),
			focused: id,
			nextZ: s.nextZ + 1,
			startOpen: false,
		})),
	minimizeWindow: (id, v = true) =>
		set((s) => {
			const windows = s.windows.map((w) => (w.id === id ? { ...w, minimized: v } : w));
			const top = windows.filter((w) => !w.minimized).sort((a, b) => b.z - a.z)[0];
			return { windows, focused: v ? (top?.id ?? null) : id };
		}),
	maximizeWindow: (id, v) =>
		set((s) => ({ windows: s.windows.map((w) => (w.id === id ? { ...w, maximized: v ?? !w.maximized } : w)) })),
	moveWindow: (id, x, y) => set((s) => ({ windows: s.windows.map((w) => (w.id === id ? { ...w, x, y } : w)) })),
	resizeWindow: (id, w, h) =>
		set((s) => ({
			windows: s.windows.map((win) => (win.id === id ? { ...win, w: Math.max(360, w), h: Math.max(240, h) } : win)),
		})),
	setTitle: (id, title) => set((s) => ({ windows: s.windows.map((w) => (w.id === id ? { ...w, title } : w)) })),
	setStartOpen: (v) => set({ startOpen: v }),
	toast: (t) => {
		const id = ++toastCounter;
		set((s) => ({ toasts: [...s.toasts, { ...t, id, at: Date.now() }] }));
		setTimeout(() => get().dismissToast(id), 8000);
	},
	dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Convenience for non-React callers (tool executors). */
export const os = {
	get: () => useOS.getState(),
	openWindow: (...args: Parameters<OsState["openWindow"]>) => useOS.getState().openWindow(...args),
	toast: (t: Omit<Toast, "id" | "at">) => useOS.getState().toast(t),
	touchFs: () => useOS.getState().touchFs(),
};
