import { Editor } from "@earendil-works/pi-tui";

/** Apply Pi prompt arguments with no supplied values, preserving literal defaults. */
export function emptyPromptArgs(body: string): string {
	return body.replace(
		/\$\{(\d+|ARGUMENTS|@):-([^}]*)\}|\$\{@:(\d+)(?::(\d+))?\}|\$(ARGUMENTS|@|\d+)/g,
		(_match: string, target: string | undefined, fallback: string | undefined) => target ? fallback ?? "" : "",
	);
}

export function completeOrExpand(
	editor: Editor,
	getSnippets: () => ReadonlyMap<string, { body?: string }>,
): boolean {
	const { line, col } = editor.getCursor();
	const text = editor.getLines()[line];
	if (text === undefined) return false;
	const match = text.slice(0, col).match(/(?<!\/)snipet:([^\s]*)$/);
	// Only handle a token ending at the cursor, not the middle of a longer name.
	if (!match || /\S/.test(text[col] ?? "")) return false;
	const snippets = getSnippets();
	const name = match[1];
	if (!snippets.has(name)) {
		const matches = [...snippets.keys()].filter(candidate => candidate.startsWith(name));
		const first = matches[0];
		if (first === undefined) return false;
		const prefix = [...first];
		while (!matches.every(candidate => candidate.startsWith(prefix.join("")))) prefix.pop();
		// Consume ambiguous Tab without choosing an arbitrary match.
		editor.insertTextAtCursor(prefix.join("").slice(name.length));
		return true;
	}
	const body = snippets.get(name)?.body;
	if (body === undefined) return false;
	const disableSubmit = editor.disableSubmit;
	editor.disableSubmit = true;
	try {
		// Bypass app shortcuts. Shift+Backspace is Pi's explicit deletion fallback.
		Editor.prototype.handleInput.call(editor, "\x1b");
		for (const _ of new Intl.Segmenter().segment(match[0])) {
			Editor.prototype.handleInput.call(editor, "\x1b[127;2u");
		}
		editor.insertTextAtCursor(body);
		Editor.prototype.handleInput.call(editor, "\x1b");
	} finally {
		editor.disableSubmit = disableSubmit;
	}
	return true;
}
