/** Dev-only handles for driving the workstation from DevTools or a test script. */
import { useBrowser } from "./os/kernel/browser";
import { launch } from "./os/kernel/launch";
import { useShell } from "./os/kernel/shell";
import { useOS } from "./os/kernel/store";
import { useStratum } from "./stratum/app/store";
import { runTurn } from "./stratum/app/turn";

if (import.meta.env.DEV) {
	(window as unknown as Record<string, unknown>).__ws = { useOS, useShell, useBrowser, useStratum, launch, runTurn };
}
