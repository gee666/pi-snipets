import { readFileSync } from "node:fs";
import { CustomEditor, parseFrontmatter, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Editor, matchesKey } from "@earendil-works/pi-tui";

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
						snippet.body = body.replace(
							/\$\{(\d+|ARGUMENTS|@):-([^}]*)\}|\$\{@:(\d+)(?::(\d+))?\}|\$(ARGUMENTS|@|\d+)/g,
							(_match, target, fallback) => target ? fallback : "",
						);
					} catch (error) {
						ctx.ui.notify(`Snippet /snipet:${command.name} unavailable: ${String(error)}`, "warning");
					}
				}
				loaded.set(command.name, snippet);
			}
			snippets = loaded;
		}
		refreshPrompts();

		function completeOrExpand(editor: CustomEditor): boolean {
			const { line, col } = editor.getCursor();
			const text = editor.getLines()[line];
			const match = text.slice(0, col).match(/\/snipet:([^\s]*)$/);
			// Only handle a token ending at the cursor, not the middle of a longer name.
			if (!match || /\S/.test(text[col] ?? "")) return false;
			// resources_discover adds prompts AFTER session_start. Follow that registry too.
			refreshPrompts();
			const name = match[1];
			if (!snippets.has(name)) {
				const matches = [...snippets.keys()].filter(candidate => candidate.startsWith(name));
				if (!matches.length) return false;
				const prefix = [...matches[0]];
				while (!matches.every(candidate => candidate.startsWith(prefix.join("")))) prefix.pop();
				// One match fills the name; several fill only their common prefix.
				// Consume Tab even if the prefix cannot grow, never choose arbitrarily.
				editor.insertTextAtCursor(prefix.join("").slice(name.length));
				return true;
			}
			const body = snippets.get(name)!.body;
			if (body === undefined) return false;
			const disableSubmit = editor.disableSubmit;
			editor.disableSubmit = true;
			try {
				// Base Editor input bypasses app shortcuts. Shift+Backspace is an explicit
				// deletion fallback in Pi, independent of the configured Backspace binding.
				Editor.prototype.handleInput.call(editor, "\x1b");
				for (const _ of new Intl.Segmenter().segment(match[0])) {
					Editor.prototype.handleInput.call(editor, "\x1b[127;2u");
				}
				editor.insertTextAtCursor(body);
				Editor.prototype.handleInput.call(editor, "\x1b");
				// Insertion leaves the cursor after the snippet and before the original suffix.
			} finally {
				editor.disableSubmit = disableSubmit;
			}
			return true;
		}

		class SnippetEditor extends CustomEditor {
			handleInput(data: string): void {
				if (matchesKey(data, "tab") && completeOrExpand(this)) {
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
				if (matchesKey(data, "tab") && completeOrExpand(editor)) {
					tui.requestRender();
					return;
				}
				handleInput(data);
			};
			return editor;
		});
	});
}
