import { readFileSync } from "node:fs";
import { CustomEditor, parseFrontmatter, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { matchesKey } from "@earendil-works/pi-tui";
import { completeOrExpand, emptyPromptArgs } from "./snippets.ts";

// getCommands exposes Pi's loaded prompt names and winning paths, not bodies.
// Read only those paths; cache bodies until /reload. No separate prompt discovery.
export default function (pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		let snippets = new Map<string, { path: string; body?: string }>();
		function refreshPrompts(): void {
			const loaded = new Map<string, { path: string; body?: string }>();
			for (const command of pi.getCommands()) {
				if (command.source !== "prompt" || loaded.has(command.name)) continue;
				const path = command.sourceInfo.path;
				let snippet = snippets.get(command.name);
				if (!snippet || snippet.path !== path) {
					snippet = { path };
					try {
						const { body } = parseFrontmatter(readFileSync(path, "utf8"));
						// Pi substituteArgs with zero args, including non-recursive defaults.
						snippet.body = emptyPromptArgs(body);
					} catch (error) {
						ctx.ui.notify(`Snippet snipet:${command.name} unavailable: ${String(error)}`, "warning");
					}
				}
				loaded.set(command.name, snippet);
			}
			snippets = loaded;
		}
		refreshPrompts();

		function getSnippets() {
			// resources_discover adds prompts AFTER session_start. Follow that registry too.
			refreshPrompts();
			return snippets;
		}

		class SnippetEditor extends CustomEditor {
			handleInput(data: string): void {
				if (matchesKey(data, "tab") && completeOrExpand(this, getSnippets)) {
					this.tui.requestRender();
					return;
				}
				super.handleInput(data);
			}
		}

		const previous = ctx.ui.getEditorComponent();
		ctx.ui.setEditorComponent((tui, theme, keybindings) => {
			if (!previous) return new SnippetEditor(tui, theme, keybindings);
			// Preserve the installed limits-wait editor's submission wrapper.
			const editor = previous(tui, theme, keybindings) as CustomEditor;
			if (typeof editor.getLines !== "function" || typeof editor.getCursor !== "function" ||
				typeof editor.insertTextAtCursor !== "function" || typeof editor.handleInput !== "function") {
				ctx.ui.notify("Prompt snippets disabled: the existing custom editor lacks Pi editor methods.", "warning");
				return editor;
			}
			const handleInput = editor.handleInput.bind(editor);
			editor.handleInput = (data: string) => {
				if (matchesKey(data, "tab") && completeOrExpand(editor, getSnippets)) {
					tui.requestRender();
					return;
				}
				handleInput(data);
			};
			return editor;
		});
	});
}
