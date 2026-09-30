/**
 * The PowerShell-shaped interpreter behind the Terminal app. Real over the
 * virtual filesystem; `node -e` really evaluates JavaScript in a Web Worker.
 * Python is honestly absent.
 */
import { baseName, HOME, normalizePath, VirtualFs } from "./fs";
import { os } from "./store";

export interface ShellResult {
	output: string;
	exitCode: number;
	cwd: string;
	clear?: boolean;
}

function fmtDate(ms: number) {
	const d = new Date(ms);
	return d.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" }) + "  " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function tokenize(line: string): string[] {
	const out: string[] = [];
	const re = /"((?:[^"\\]|\\.)*)"|'((?:[^'']|'')*)'|(\S+)/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(line))) out.push(m[1] !== undefined ? m[1].replace(/\\"/g, '"') : m[2] !== undefined ? m[2].replace(/''/g, "'") : m[3]);
	return out;
}

const WORKER_SOURCE = `
self.onmessage = (e) => {
  const logs = [];
  const orig = console.log;
  console.log = (...a) => logs.push(a.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(" "));
  console.error = console.log;
  try {
    const fn = new Function(e.data);
    const result = fn();
    if (result !== undefined && logs.length === 0) logs.push(String(result));
    self.postMessage({ ok: true, output: logs.join("\\n") });
  } catch (err) {
    self.postMessage({ ok: false, output: logs.join("\\n"), error: String(err && err.stack ? err.message : err) });
  }
};`;

export async function runNode(code: string): Promise<{ output: string; exitCode: number }> {
	const blob = new Blob([WORKER_SOURCE], { type: "text/javascript" });
	const url = URL.createObjectURL(blob);
	const worker = new Worker(url);
	return new Promise((resolve) => {
		const timer = setTimeout(() => {
			worker.terminate();
			resolve({ output: "node : script timed out after 5 seconds", exitCode: 1 });
		}, 5000);
		worker.onmessage = (e) => {
			clearTimeout(timer);
			worker.terminate();
			URL.revokeObjectURL(url);
			const d = e.data as { ok: boolean; output: string; error?: string };
			resolve({ output: d.ok ? d.output : [d.output, `node : ${d.error}`].filter(Boolean).join("\n"), exitCode: d.ok ? 0 : 1 });
		};
		worker.onerror = (e) => {
			clearTimeout(timer);
			worker.terminate();
			resolve({ output: `node : ${e.message}`, exitCode: 1 });
		};
		worker.postMessage(code);
	});
}

export async function runCommand(line: string, cwd: string, fs: VirtualFs): Promise<ShellResult> {
	const trimmed = line.trim();
	if (trimmed === "") return { output: "", exitCode: 0, cwd };

	// `node -e "<code>"` — take everything after -e as the program, quotes stripped once.
	const node = /^node(?:\.exe)?\s+(?:-e|--eval)\s+([\s\S]+)$/i.exec(trimmed);
	if (node) {
		let code = node[1].trim();
		if ((code.startsWith('"') && code.endsWith('"')) || (code.startsWith("'") && code.endsWith("'"))) {
			code = code.slice(1, -1);
			if (node[1].trim().startsWith('"')) code = code.replace(/\\"/g, '"');
			else code = code.replace(/''/g, "'");
		}
		const r = await runNode(code);
		return { ...r, cwd };
	}

	const [cmd, ...args] = tokenize(trimmed);
	const c = cmd.toLowerCase();
	const ok = (output: string): ShellResult => ({ output, exitCode: 0, cwd });
	const fail = (output: string): ShellResult => ({ output, exitCode: 1, cwd });
	try {
		switch (c) {
			case "get-childitem":
			case "ls":
			case "dir": {
				const target = normalizePath(args.find((a) => !a.startsWith("-")) ?? ".", cwd);
				const rows = fs.list(target);
				const lines = [``, `    Directory: ${target}`, ``, `Mode                 LastWriteTime         Length Name`, `----                 -------------         ------ ----`];
				for (const n of rows) {
					const mode = n.kind === "dir" ? "d-----" : "-a----";
					const len = n.kind === "dir" ? "" : String(typeof n.data === "string" ? n.data.length : n.data.byteLength);
					lines.push(`${mode.padEnd(20)} ${fmtDate(n.modified).padEnd(21)} ${len.padStart(6)} ${n.name}`);
				}
				return ok(lines.join("\n"));
			}
			case "set-location":
			case "cd":
			case "chdir": {
				const target = normalizePath(args[0] ?? HOME, cwd);
				if (!fs.isDir(target)) return fail(`Set-Location : Cannot find path '${target}' because it does not exist.`);
				return { output: "", exitCode: 0, cwd: target };
			}
			case "get-location":
			case "pwd":
				return ok(`\nPath\n----\n${cwd}`);
			case "get-content":
			case "cat":
			case "type":
			case "gc": {
				if (!args[0]) return fail("Get-Content : Missing an argument for parameter 'Path'.");
				return ok(fs.readText(normalizePath(args[0], cwd)));
			}
			case "set-content":
			case "sc": {
				if (args.length < 2) return fail("Set-Content : Missing an argument for parameter 'Value'.");
				fs.write(normalizePath(args[0], cwd), args.slice(1).join(" "));
				os.touchFs();
				return ok("");
			}
			case "new-item":
			case "ni":
			case "mkdir":
			case "md": {
				const isDir = c === "mkdir" || c === "md" || args.some((a) => /^-itemtype$/i.test(a)) && args.some((a) => /^directory$/i.test(a));
				const name = args.find((a) => !a.startsWith("-") && !/^(directory|file)$/i.test(a));
				if (!name) return fail("New-Item : Missing an argument for parameter 'Path'.");
				const p = normalizePath(name, cwd);
				if (isDir) fs.mkdir(p);
				else fs.write(p, "");
				os.touchFs();
				return ok(`\n    Directory: ${p.slice(0, p.lastIndexOf("\\"))}\n\n${isDir ? "d-----" : "-a----"}               ${fmtDate(Date.now())}              ${baseName(p)}`);
			}
			case "remove-item":
			case "rm":
			case "del":
			case "rmdir": {
				const name = args.find((a) => !a.startsWith("-"));
				if (!name) return fail("Remove-Item : Missing an argument for parameter 'Path'.");
				fs.remove(normalizePath(name, cwd));
				os.touchFs();
				return ok("");
			}
			case "write-output":
			case "write-host":
			case "echo":
				return ok(args.join(" "));
			case "get-date":
				return ok(new Date().toString());
			case "clear-host":
			case "cls":
			case "clear":
				return { output: "", exitCode: 0, cwd, clear: true };
			case "hostname":
				return ok("CMPDI-WS-0930");
			case "whoami":
				return ok("mrpl\\operator");
			case "get-process":
			case "ps": {
				const wins = os.get().windows;
				const lines = [`\n Handles  NPM(K)    PM(K)      WS(K)     CPU(s)     Id  SI ProcessName`, ` -------  ------    -----      -----     ------     --  -- -----------`];
				let pid = 1204;
				for (const w of wins) lines.push(`     ${String(180 + w.z).padStart(3)}      ${String(12).padStart(2)}    ${String(40120 + w.z * 37).padStart(5)}      ${String(61230 + w.z * 41).padStart(5)}       0.${w.z % 10}${w.z % 7}   ${String((pid += 116)).padStart(4)}   1 ${w.app}`);
				lines.push(`     ${"402".padStart(3)}      ${"31".padStart(2)}    ${"88120".padStart(5)}     ${"131230".padStart(6)}       3.14   ${"912".padStart(4)}   1 explorer`);
				return ok(lines.join("\n"));
			}
			case "python":
			case "python3":
			case "py":
			case "pip":
				return fail(
					`${cmd} : The term '${cmd}' is not recognized as the name of a cmdlet, function, script file, or operable program.\nPython is not installed on this workstation. Use node -e "..." for a calculation.`,
				);
			case "help":
			case "get-help":
				return ok(
					"Available: Get-ChildItem (ls, dir), Set-Location (cd), Get-Location (pwd), Get-Content (cat, type), Set-Content, New-Item (mkdir), Remove-Item (rm, del), Write-Output (echo), Get-Date, Get-Process, Clear-Host (cls), hostname, whoami, node -e \"<js>\"",
				);
			case "start":
			case "start-process":
			case "invoke-item":
			case "explorer":
			case "invoke-webrequest":
			case "iwr":
			case "invoke-restmethod":
			case "irm":
			case "curl":
			case "wget":
				return fail(`${cmd} : This workstation has no route off the box. The request was not sent.`);
			default:
				return fail(
					`${cmd} : The term '${cmd}' is not recognized as the name of a cmdlet, function, script file, or operable program. Check the spelling of the name, or if a path was included, verify that the path is correct and try again.`,
				);
		}
	} catch (error) {
		return fail(`${cmd} : ${error instanceof Error ? error.message : String(error)}`);
	}
}
