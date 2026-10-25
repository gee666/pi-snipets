import { appendFileSync, existsSync, readFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Feed the actual installed editor while Pi's stdin stays /dev/null.
// This deliberately does not test terminal byte decoding or global shortcuts.
export default function (pi: ExtensionAPI) {
	const inputPath = `${process.env.SNIPPET_TEST_DIR}/input.jsonl`;
	let offset = existsSync(inputPath) ? readFileSync(inputPath, "utf8").split("\n").length - 1 : 0;
	let timer: ReturnType<typeof setInterval> | undefined;
	pi.on("session_shutdown", () => clearInterval(timer));
	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		const factory = ctx.ui.getEditorComponent();
		if (!factory) throw new Error("Snippet editor was not installed");
		ctx.ui.setEditorComponent((tui, theme, keys) => {
			const editor = factory(tui, theme, keys);
			clearInterval(timer);
			timer = setInterval(() => {
				if (!existsSync(inputPath)) return;
				const lines = readFileSync(inputPath, "utf8").split("\n").slice(0, -1);
				for (const line of lines.slice(offset)) {
					offset++;
					const input: unknown = JSON.parse(line);
					if (typeof input !== "string") throw new Error("Expected key input");
					if (input === "\x15") ctx.ui.setEditorText("");
					else for (const key of input) editor.handleInput?.(key);
					appendFileSync(`${process.env.SNIPPET_TEST_DIR}/events.jsonl`, JSON.stringify({ type: "draft", value: ctx.ui.getEditorText() }) + "\n");
				}
			}, 30);
			return editor;
		});
	});
}
