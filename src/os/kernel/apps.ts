import type { ComponentType } from "react";

export interface AppProps {
	windowId: string;
	args?: Record<string, unknown>;
	nonce: number;
}

export interface AppManifest {
	id: string;
	title: string;
	component: ComponentType<AppProps>;
	w: number;
	h: number;
	singleton?: boolean;
	pinned?: boolean;
	desktop?: boolean;
}

const registry = new Map<string, AppManifest>();

export function registerApp(app: AppManifest) {
	registry.set(app.id, app);
}

export function getApp(id: string) {
	return registry.get(id);
}

export function allApps() {
	return [...registry.values()];
}
