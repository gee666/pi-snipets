import { appendFileSync } from "node:fs";
import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Only supported SDK observers; never replace the snippet handler or provider transport.
export default function (pi: ExtensionAPI) {
	const log = (type: string, value: unknown = null) => appendFileSync(`${process.env.SNIPPET_TEST_DIR}/events.jsonl`, JSON.stringify({ type, value }) + "\n");
	const timers = new Set<ReturnType<typeof setTimeout>>();
	pi.on("session_shutdown", () => {
		for (const timer of timers) clearTimeout(timer);
		timers.clear();
	});
	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		if (process.env.SNIPPET_TEST_DEFAULT_EDITOR !== "1") ctx.ui.setEditorComponent((tui, theme, keys) => {
			class SubmissionWrapper extends CustomEditor {
				override handleInput(data: string) {
					if (data === "\r") log("enter");
					super.handleInput(data);
				}
			}
			return new SubmissionWrapper(tui, theme, keys);
		});
		timers.add(setTimeout(() => log("ready"), 300));
	});
	pi.on("resources_discover", () => ({ promptPaths: [`${process.env.SNIPPET_TEST_DIR}/evergreen.md`] }));
	pi.on("before_provider_request", event => log("request", event.payload));
	pi.on("after_provider_response", event => log("response", event.status));
	pi.on("agent_settled", (_event, ctx) => log("settled", ctx.sessionManager.getEntries()));
}
