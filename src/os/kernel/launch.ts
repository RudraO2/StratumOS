import { getApp } from "./apps";
import { useOS } from "./store";

/** Open an app by id, honouring its manifest (size, singleton). */
export function launch(appId: string, args?: Record<string, unknown>, title?: string): string {
	const app = getApp(appId);
	if (!app) throw new Error(`no app registered as "${appId}"`);
	return useOS.getState().openWindow(appId, { title: title ?? app.title, args, w: app.w, h: app.h, singleton: app.singleton });
}
