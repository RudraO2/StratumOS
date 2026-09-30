/**
 * The terminal session: one shared PowerShell-shaped session the Terminal app
 * renders and tool calls type into. Kept outside React so an executor can run
 * a command and read the result whether or not the window is open.
 */
import { create } from "zustand";
import { HOME } from "./fs";
import { useOS } from "./store";
import { runCommand } from "./terminal";

export interface TermLine {
	id: number;
	kind: "prompt" | "output" | "error" | "typing";
	text: string;
}

interface ShellState {
	lines: TermLine[];
	cwd: string;
	busy: boolean;
	history: string[];
	append(kind: TermLine["kind"], text: string): number;
	replace(id: number, kind: TermLine["kind"], text: string): void;
	clear(): void;
	run(command: string, opts?: { animate?: boolean }): Promise<{ output: string; exitCode: number }>;
}

let lineCounter = 0;
const BANNER = "MRPL Workstation PowerShell 7.4.6\nFaraday sandbox shell. Type 'help' for the commands this workstation supports.\n";

export const useShell = create<ShellState>((set, get) => ({
	lines: [{ id: ++lineCounter, kind: "output", text: BANNER }],
	cwd: HOME,
	busy: false,
	history: [],
	append: (kind, text) => {
		const id = ++lineCounter;
		set((s) => ({ lines: [...s.lines, { id, kind, text }] }));
		return id;
	},
	replace: (id, kind, text) => set((s) => ({ lines: s.lines.map((l) => (l.id === id ? { ...l, kind, text } : l)) })),
	clear: () => set({ lines: [] }),
	run: async (command, opts = {}) => {
		const { append, replace, cwd } = get();
		const promptText = `PS ${cwd}> `;
		set({ busy: true, history: [...get().history, command] });
		const id = append("prompt", promptText);
		if (opts.animate) {
			// Type it out so the officer sees the workbench acting, not a paste.
			let shown = "";
			for (const ch of command) {
				shown += ch;
				replace(id, "prompt", promptText + shown);
				await new Promise((r) => setTimeout(r, command.length > 120 ? 6 : 18));
			}
			await new Promise((r) => setTimeout(r, 180));
		} else {
			replace(id, "prompt", promptText + command);
		}
		const result = await runCommand(command, cwd, useOS.getState().fs);
		if (result.clear) set({ lines: [] });
		else if (result.output !== "") append(result.exitCode === 0 ? "output" : "error", result.output);
		set({ cwd: result.cwd, busy: false });
		return { output: result.output, exitCode: result.exitCode };
	},
}));

export const shell = { get: () => useShell.getState() };
