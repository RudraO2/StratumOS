import type { AppProps } from "../kernel/apps";
import { launch } from "../kernel/launch";
import { useOS } from "../kernel/store";
import { AppIcon } from "../shell/Icon";

/** The full project (Python backend, local models). Not published yet; the link appears once this is set. */
const LOCAL_REPO: string = "";

/** The first-run notice: the disclaimer comes first, in one line, then what is and is not simulated. */
export function Welcome({ windowId }: AppProps) {
	const closeWindow = useOS((s) => s.closeWindow);
	return (
		<div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "22px 26px 20px", fontSize: 14, lineHeight: 1.55 }}>
			<div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
				<AppIcon app="stratum" size={40} />
				<div>
					<div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>Stratum — demo build</div>
					<div style={{ color: "var(--label-secondary)", fontSize: 12 }}>Smart India Hackathon 2026 · CMPDI / Coal India Limited</div>
				</div>
			</div>
			<div
				role="note"
				style={{ padding: "10px 14px", borderRadius: 8, background: "var(--warn-tertiary)", border: "1px solid var(--warn-primary)", color: "var(--warn-label)", fontWeight: 600, fontSize: 15, marginBottom: 12 }}
			>
				Okay, this is a demoable version.
			</div>
			<p style={{ margin: "0 0 8px" }}>
				A Windows-style workstation in your browser, with Stratum running inside it. Questions are answered by <strong>hosted open-weight models through the Groq API</strong>, over a sample library of eight coal documents that were already read and extracted. It is the only way a public link can answer.
			</p>
			<p style={{ margin: "0 0 8px" }}>
				<strong>The real product runs on the officer's own machine:</strong> local models, nothing leaves it, and any document you drop in is parsed, checked and added. Here the library is fixed, and adding a document is not simulated. The lookups, the number guard, the citations and the .docx drafts are the same logic.
			</p>
			{LOCAL_REPO !== "" && (
				<p style={{ margin: 0, fontSize: 12.5, color: "var(--label-secondary)" }}>
					Run the real one locally:{" "}
					<button
						onClick={() => {
							closeWindow(windowId);
							launch("browser", { url: LOCAL_REPO });
						}}
						style={{ color: "var(--accent)", textDecoration: "underline" }}
					>
						{LOCAL_REPO.replace("https://", "")}
					</button>
				</p>
			)}
			<div style={{ flex: 1 }} />
			<div style={{ display: "flex", justifyContent: "center", marginTop: 18 }}>
				<button
					autoFocus
					onClick={() => {
						closeWindow(windowId);
						launch("stratum", { tour: true });
					}}
					style={{ padding: "10px 28px", borderRadius: 6, background: "var(--accent)", color: "var(--accent-label)", fontWeight: 600, fontSize: 14 }}
				>
					Open Stratum
				</button>
			</div>
		</div>
	);
}
