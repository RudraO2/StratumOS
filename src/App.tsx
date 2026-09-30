import { useEffect } from "react";
import { Browser } from "./os/apps/Browser";
import { Explorer } from "./os/apps/Explorer";
import { ImageViewer } from "./os/apps/ImageViewer";
import { Notepad } from "./os/apps/Notepad";
import { Settings } from "./os/apps/Settings";
import { Terminal } from "./os/apps/Terminal";
import { Welcome } from "./os/apps/Welcome";
import { registerApp } from "./os/kernel/apps";
import { launch } from "./os/kernel/launch";
import { useOS } from "./os/kernel/store";
import { Boot } from "./os/shell/Boot";
import { Desktop } from "./os/shell/Desktop";
import { Library } from "./stratum/app/Library";
import { Stratum } from "./stratum/app/Stratum";

registerApp({ id: "stratum", title: "Stratum", component: Stratum, w: 1180, h: 760, singleton: true, pinned: true, desktop: true });
registerApp({ id: "library", title: "Library", component: Library, w: 980, h: 640, singleton: true, pinned: true, desktop: true });
registerApp({ id: "explorer", title: "File Explorer", component: Explorer, w: 860, h: 540, singleton: true, pinned: true, desktop: true });
registerApp({ id: "terminal", title: "Terminal", component: Terminal, w: 820, h: 480, singleton: true, pinned: true, desktop: true });
registerApp({ id: "browser", title: "Browser", component: Browser, w: 1000, h: 680, singleton: true, pinned: true, desktop: true });
registerApp({ id: "notepad", title: "Notepad", component: Notepad, w: 720, h: 520, desktop: true });
registerApp({ id: "settings", title: "Settings", component: Settings, w: 760, h: 520, singleton: true, pinned: true });
registerApp({ id: "viewer", title: "Photos", component: ImageViewer, w: 760, h: 560 });
registerApp({ id: "welcome", title: "What you are looking at", component: Welcome, w: 620, h: 400, singleton: true });

export default function App() {
	const theme = useOS((s) => s.theme);
	const booted = useOS((s) => s.booted);
	useEffect(() => {
		document.documentElement.dataset.theme = theme;
	}, [theme]);
	useEffect(() => {
		if (booted) launch("welcome");
	}, [booted]);
	return booted ? <Desktop /> : <Boot />;
}
