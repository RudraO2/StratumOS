/**
 * The egress denial policy — the pure half of the prototype's waterfall
 * (`reference/plugins/dsh-client-ui-base/lib/index.js`, lines 119-303),
 * extracted verbatim. Which names and command shapes are refused, and the
 * exact reason strings. The waterfall itself lives in `../../tools/execute.ts`.
 */

/**
 * Tool names known to reach outside the machine. Deny-by-name is a
 * deliberately simple policy for Phase 0: `tools/pre-execute` must decide
 * before the tool body runs, so the decision has to come from the call's
 * static name rather than from watching it actually try to connect. Any
 * future tool that can reach the network must be added here.
 *
 * `web_search` and `web_fetch` are names the harness's own `tool-web` would
 * have used, kept here as defence in depth after Story 1.2 removed the package
 * that provides them. The work of actually catching an outbound attempt now
 * falls to the `pwsh` command patterns below, because the sandbox shell is the
 * only network-capable surface this profile still mounts.
 *
 * Membership of this set is not by itself a refusal: the waterfall consults the
 * seal (`egress/seal.js`) first, and with the seal open a named tool here runs
 * and is recorded as {@link PERMITTED_EVENT} instead. Opening the seal is what
 * lets a real outbound connection out of this machine — deliberately, from the
 * UI, recorded, and closed again by a restart.
 */
export const NETWORK_TOOL_NAMES = new Set(["web_search", "web_fetch", "browser_open"]);

/**
 * The tool name Story 5.3 enables (`tool-pwsh`; the Windows executor per
 * `docs/deepseek-harness-notes.md` — `dsh-bash-sandbox` never loads on
 * win32). It is deliberately not in {@link NETWORK_TOOL_NAMES}: a coding task
 * needs `pwsh` to run, so the whole tool cannot be denied by name the way
 * `web_search`/`web_fetch` are. Only a call whose `command` argument itself
 * reaches for the network is denied — see {@link NETWORK_PWSH_PATTERN}.
 */
export const PWSH_TOOL_NAME = "pwsh";

/**
 * Matches command text that reaches the network from inside a `pwsh` call:
 * the two clients Story 5.3's acceptance criteria name explicitly
 * (`Invoke-WebRequest`/`iwr`, `curl`), their less-common cousins
 * (`Invoke-RestMethod`/`irm`, `wget`, `Start-BitsTransfer`,
 * `Test-NetConnection`), and the raw-socket/HTTP-client .NET types a script
 * could reach for instead of a cmdlet. Case-insensitive, matched against the
 * call's `command` argument text.
 *
 * This is the same deliberately simple deny-by-pattern policy
 * {@link NETWORK_TOOL_NAMES} already accepts for Phase 0 (`tools/pre-execute`
 * must decide before the body runs, from the call's static shape, not by
 * watching it actually try to connect) — applied to command text instead of a
 * tool name because `pwsh` carries both network and non-network commands
 * under one name. A determined script can still evade a text match; that is a
 * known Phase 0 limitation of this policy, not an oversight.
 */
export const NETWORK_PWSH_PATTERN =
	/\b(Invoke-WebRequest|iwr|Invoke-RestMethod|irm|curl(\.exe)?|wget|Start-BitsTransfer|Test-NetConnection)\b|Net\.Sockets\.(TcpClient|TcpListener|UdpClient|Socket)|Net\.(WebClient|Http\.HttpClient)|Net\.Dns/i;

/**
 * Matches Python's network surface, for the same reason and in the same place.
 *
 * **Why this exists.** The coding lane asks the model for Python, not
 * PowerShell — measured on 30 August 2026, the 1.5B coder produced runnable
 * PowerShell zero times out of nine and runnable Python six times out of nine
 * (`docs/measurements/local-inference-lanes/issues/08`). The executor is still
 * `tool-pwsh`, because `dsh-bash-sandbox` never loads on win32; the command
 * simply invokes the interpreter.
 *
 * That change, made without this pattern, would have opened a hole in the one
 * claim this product rests on. {@link NETWORK_PWSH_PATTERN} knows PowerShell
 * cmdlets and .NET types and nothing else, so a Python program calling
 * `urllib.request.urlopen` would have walked straight past the waterfall while
 * the egress monitor kept reading a counted zero — reachable by any judge who
 * types a prompt at the sandbox, not by a determined attacker.
 *
 * Covers the standard library's clients and raw sockets, the two third-party
 * clients an agent reaches for unprompted, and `webbrowser`, which opens a URL
 * without importing anything that looks like a network module.
 */
export const NETWORK_PYTHON_PATTERN =
	/\b(urllib|urlopen|Request|requests|httpx|aiohttp|http\.client|httplib|socket|socketserver|ftplib|smtplib|poplib|imaplib|telnetlib|nntplib|xmlrpc|webbrowser|websocket|websockets|paramiko|pycurl)\b|\basyncio\.open_connection\b|\bcreate_connection\b/i;

/**
 * Matches an interpreter invocation whose code this waterfall cannot read.
 *
 * `tools/pre-execute` decides from the call's static shape, before the body
 * runs. That works when the program is inline — `python -c "..."` puts the
 * whole thing in the `command` argument, where {@link NETWORK_PYTHON_PATTERN}
 * can see it. It does **not** work for `python script.py`, because the file's
 * contents are not in the call, and it does not work for `python -m
 * http.server`, where the module does the reaching.
 *
 * That is a one-step bypass rather than a determined evasion: an agent that
 * writes a file with `tool-fs` and then runs it would defeat the seal without
 * trying to. So for Phase 0 the interpreter is only permitted inline, which is
 * all the coding lane needs and all the demo does. Widening this is a decision
 * to record, not a convenience to add at the point of use.
 *
 * Deliberately does not match a bare `python --version` or `python -c ...`.
 */
export const UNINSPECTABLE_PYTHON_PATTERN = /(?:^|[\s;&|(])(?:python[\d.]*|py|pythonw)(?:\.exe)?\s+(?!-c\b|-V\b|--version\b)[^\s]/i;

/**
 * Matches a command that hands something to the operating system to *open* —
 * a browser, a shell association, a registered URI handler.
 *
 * **Why this exists.** Everything above knows what a network *client* looks
 * like: a cmdlet that fetches, a Python module that connects. None of it knows
 * what "open WhatsApp" looks like, and that is the request this workbench now
 * demonstrates itself with. `Start-Process "https://web.whatsapp.com"` opens
 * the default browser on the host and reaches the internet without importing
 * anything, without naming a client, and without matching a single pattern
 * above. Measured on 30 August 2026 against the real waterfall with the seal
 * closed: seven of eleven "open WhatsApp" shapes were permitted through to
 * their tool body.
 *
 * Nothing further out catches them either. The harness's own sandbox is
 * explicit that it does not try: `@deepseek-ai/dsh-sandbox` — "File effects are
 * the whole policy vocabulary; the seam expresses no network, process, syscall,
 * device, or credential restrictions" — and the Windows backend that actually
 * confines `tool-pwsh` here, `@deepseek-ai/dsh-sandbox-windows-acl`, "restricts
 * writes; reads, network, and process visibility are not". This waterfall is
 * the only thing standing there.
 *
 * Names are matched in full, hyphen included, so the cmdlets a coding lane
 * legitimately uses are untouched: `Start-Process` is here, `Start-Sleep` is
 * not, and a bare `start` is left to {@link URI_ARGUMENT_PATTERN} rather than
 * matched as a word — `\bstart\b` also matches the first half of `Start-Sleep`,
 * which would deny the sandbox its own timer.
 *
 * Browsers are named only with their `.exe`, for the same reason in the other
 * direction: `chrome`, `brave` and `opera` are ordinary English words, and a
 * policy that refused `print("be brave")` would be discredited by the first
 * person who tried it. Nothing is lost by the restraint — a browser launched
 * without its extension goes through `Start-Process` or `start`, and a browser
 * launched at all carries the address it is being sent to, so
 * {@link URI_ARGUMENT_PATTERN} has it either way.
 */
export const NETWORK_LAUNCHER_PATTERN =
	/\b(?:Start-Process|Invoke-Item|explorer|rundll32)(?:\.exe)?\b|\b(?:msedge|chrome|firefox|iexplore|brave|opera)\.exe\b|\[(?:System\.)?Diagnostics\.Process\]::Start/i;

/**
 * Matches a URL or an application URI anywhere in the command text.
 *
 * The companion to {@link NETWORK_LAUNCHER_PATTERN}, and the half that closes
 * the shapes it cannot name: `cmd /c start "" https://web.whatsapp.com` uses no
 * cmdlet this policy could enumerate, and `whatsapp://send?text=hi` names no
 * program at all — the association in the registry does the reaching.
 *
 * Deliberately broad. A command that merely *mentions* a URL is refused, even
 * in a comment, because `tools/pre-execute` decides from static text and cannot
 * tell a citation from an argument. That is the same trade
 * {@link NETWORK_PYTHON_PATTERN} already makes when it refuses the bare word
 * `socket`, and it fails in the safe direction: the refusal is visible, names
 * itself, and is one sentence for an operator to read — where the other
 * direction is a browser opening on a projector.
 */
export const URI_ARGUMENT_PATTERN = /[a-z][a-z0-9+.-]*:\/\/|\b(?:mailto|tel|callto|sms|whatsapp|skype|zoommtg|slack):/i;

/**
 * Why this sandbox command must be refused, or `undefined` to allow it.
 *
 * One function so every policy reads in one place and the waterfall stays a
 * single branch. Order matters, and it runs most specific first: a named
 * network client, then a named launcher, then the mere presence of a web
 * address, then the blanket "cannot be inspected" rule. An operator reading
 * "attempted to reach the network via: curl …" learns more than one reading
 * "carried a web address", and both beat a complaint about the command's shape.
 * @param {string} command - the `command` argument of a sandbox tool call.
 * @returns {string | undefined}
 */
export function sandboxDenialReason(command) {
	if (NETWORK_PWSH_PATTERN.test(command)) {
		return `attempted to reach the network via: ${command}`;
	}
	if (NETWORK_PYTHON_PATTERN.test(command)) {
		return `attempted to reach the network from Python via: ${command}`;
	}
	if (NETWORK_LAUNCHER_PATTERN.test(command)) {
		return `asked the operating system to open something outside this application: ${command}`;
	}
	if (URI_ARGUMENT_PATTERN.test(command)) {
		return `carried a web address, which reaches the network the moment anything opens it: ${command}`;
	}
	if (UNINSPECTABLE_PYTHON_PATTERN.test(command)) {
		return (
			"ran Python from a file or module, whose contents this policy cannot inspect before execution. " +
			`Phase 0 permits the interpreter inline only (\`python -c "..."\`). Refused: ${command}`
		);
	}
	return undefined;
}

/**
 * Best-effort human-readable target from a tool call's arguments, for the
 * denial reason that lands in the session log alongside the tool name.
 *
 * The harness hands `tools/pre-execute` **parsed, frozen** arguments — the
 * registry materialises them as lossless JSON before policy starts — so the
 * object branch is the one that runs in production. The string branch is kept
 * because a caller further out may still hold the raw model-emitted JSON, and
 * because a name-only denial is worth recording even when the arguments are
 * something this function has never seen.
 *
 * Never throws: anything unrecognised falls back to a printable form, so the
 * log carries something to audit rather than nothing.
 * @param toolArguments - parsed arguments, or the raw JSON string.
 * @returns a string naming what was refused.
 */
export function describeTarget(toolArguments) {
	let args = toolArguments;
	if (typeof args === "string") {
		try {
			args = JSON.parse(args);
		} catch {
			return toolArguments;
		}
	}
	if (typeof args?.url === "string") return args.url;
	if (typeof args?.target === "string") return args.target;
	if (Array.isArray(args?.queries)) return args.queries.join(", ");
	try {
		return JSON.stringify(toolArguments) ?? String(toolArguments);
	} catch {
		return String(toolArguments);
	}
}

/**
 * The `command` argument of a `pwsh` tool call, or `undefined` when the
 * arguments do not carry one — mirrors {@link describeTarget}'s tolerance of
 * both the materialised object the harness hands the waterfall in production
 * and a raw JSON string.
 * @param toolArguments - parsed arguments, or the raw JSON string.
 */
export function pwshCommandText(toolArguments) {
	let args = toolArguments;
	if (typeof args === "string") {
		try {
			args = JSON.parse(args);
		} catch {
			return undefined;
		}
	}
	return typeof args?.command === "string" ? args.command : undefined;
}

/** The session-log event the waterfall writes when it refuses a call. */
export const EGRESS_DENIED_EVENT = "egress/denied";
/** The session-log event the waterfall writes when the seal is OPEN and it lets a call run. */
export const PERMITTED_EVENT = "egress/permitted";
