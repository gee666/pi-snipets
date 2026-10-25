import assert from "node:assert/strict";
import { test } from "node:test";
import { Editor, TuiMainScreen, getKeybindings, setKeybindings, KeybindingsManager, TUI_KEYBINDINGS, type EditorTheme, type Terminal } from "@earendil-works/pi-tui";
import { completeOrExpand, emptyPromptArgs } from "../extensions/snippets.ts";

const identity = (text: string) => text;
const theme: EditorTheme = {
	borderColor: identity,
	selectList: {
		selectedPrefix: identity, selectedText: identity, description: identity,
		scrollInfo: identity, noMatch: identity,
	},
};
const terminal: Terminal = {
	columns: 100, rows: 30, kittyProtocolActive: false,
	start() {}, stop() {}, async drainInput() {}, write() {}, moveBy() {},
	hideCursor() {}, showCursor() {}, clearLine() {}, clearFromCursor() {},
	clearScreen() {}, setTitle() {}, setProgress() {}, setProgramStatus() {},
};
// Exercise the installed Pi Editor without scheduling renders or opening a terminal.
class HeadlessTUI extends TuiMainScreen {
	override requestRender(): void {}
}
function editor(text: string) {
	const result = new Editor(new HeadlessTUI(terminal), theme);
	result.setText(text);
	result.onSubmit = () => assert.fail("Snippet expansion must not submit");
	return result;
}
function snippets(...entries: [string, string | undefined][]) {
	return () => new Map(entries.map(([name, body]) => [name, { body }]));
}

test("empty arguments remove positional, all-argument and slice references", () => {
	assert.equal(emptyPromptArgs("$1/$12/$@/$ARGUMENTS/${@:2}/${@:1:3}"), "/////");
});

test("defaults stay literal and are not recursively substituted", () => {
	assert.equal(emptyPromptArgs("${1:-review $2} ${@:-all $@} ${ARGUMENTS:-fallback} ${2:-}"), "review $2 all $@ fallback ");
	assert.equal(emptyPromptArgs("cost $USD, ${unknown}, ordinary text"), "cost $USD, ${unknown}, ordinary text");
});

test("a partial name completes first, then an exact name expands", () => {
	const e = editor("Please snipet:rev");
	const get = snippets(["review", "Review changes"]);
	assert.equal(completeOrExpand(e, get), true);
	assert.equal(e.getText(), "Please snipet:review");
	assert.equal(completeOrExpand(e, get), true);
	assert.equal(e.getText(), "Please Review changes");
	assert.equal(e.disableSubmit, false);
});

test("ambiguous names complete only their common prefix", () => {
	const e = editor("snipet:r");
	const get = snippets(["review", "one"], ["revise", "two"]);
	assert.equal(completeOrExpand(e, get), true);
	assert.equal(e.getText(), "snipet:revi");
	assert.equal(completeOrExpand(e, get), true);
	assert.equal(e.getText(), "snipet:revi");
});

test("unknown, slash-prefixed and mid-token names fall through unchanged", () => {
	for (const text of ["snipet:missing", "/snipet:review", "ordinary text"]) {
		const e = editor(text);
		assert.equal(completeOrExpand(e, snippets(["review", "body"])), false);
		assert.equal(e.getText(), text);
	}
	const e = editor("snipet:review");
	e.handleInput("\x1b[D");
	assert.equal(completeOrExpand(e, snippets(["revie", "body"])), false);
	assert.equal(e.getText(), "snipet:review");
});

test("multiline insertion preserves the suffix and leaves the cursor after the body", () => {
	const e = editor("Before snipet:review after");
	for (let i = 0; i < " after".length; i++) e.handleInput("\x1b[D");
	assert.equal(completeOrExpand(e, snippets(["review", "first\nsecond"])), true);
	assert.equal(e.getText(), "Before first\nsecond after");
	assert.deepEqual(e.getCursor(), { line: 1, col: 6 });
});

test("Unicode names delete by grapheme without removing the draft prefix", () => {
	const e = editor("Before snipet:👩‍💻é");
	assert.equal(completeOrExpand(e, snippets(["👩‍💻é", "done"])), true);
	assert.equal(e.getText(), "Before done");
});

test("unreadable bodies fall through, but empty bodies expand", () => {
	const e = editor("snipet:review");
	assert.equal(completeOrExpand(e, snippets(["review", undefined])), false);
	assert.equal(e.getText(), "snipet:review");
	assert.equal(completeOrExpand(e, snippets(["review", ""])), true);
	assert.equal(e.getText(), "");
});

test("completion uses the current registry on each Tab", () => {
	const e = editor("snipet:review");
	const current = new Map<string, { body: string }>();
	assert.equal(completeOrExpand(e, () => current), false);
	current.set("review", { body: "new prompt" });
	assert.equal(completeOrExpand(e, () => current), true);
	assert.equal(e.getText(), "new prompt");
});

test("expansion bypasses app shortcuts and honors the explicit deletion fallback with remapped keys", () => {
	const previous = getKeybindings();
	setKeybindings(new KeybindingsManager(TUI_KEYBINDINGS, { "tui.editor.deleteCharBackward": [], "tui.input.submit": "shift+backspace" }));
	try {
		class AppEditor extends Editor {
			override handleInput(): void { assert.fail("Expansion must not invoke application shortcuts"); }
		}
		const e = new AppEditor(new HeadlessTUI(terminal), theme);
		e.setText("Keep snipet:review");
		e.disableSubmit = true;
		e.onSubmit = () => assert.fail("No submission allowed");
		assert.equal(completeOrExpand(e, snippets(["review", "line1\nline2"])), true);
		assert.equal(e.getText(), "Keep line1\nline2");
		assert.equal(e.disableSubmit, true);
	} finally {
		setKeybindings(previous);
	}
});

test("active autocomplete is dismissed without accepting or submitting a different suggestion", async () => {
	const e = editor("snipet:review");
	e.setAutocompleteProvider({
		async getSuggestions() { return { prefix: "snipet:review", items: [{ value: "WRONG", label: "WRONG" }, { value: "OTHER", label: "OTHER" }] }; },
		applyCompletion() { assert.fail("Expansion must not accept an unrelated autocomplete suggestion"); },
	});
	e.handleInput("\t");
	await new Promise(resolve => setTimeout(resolve, 20));
	assert.equal(completeOrExpand(e, snippets(["review", "right"])), true);
	assert.equal(e.getText(), "right");
	e.handleInput("!");
	assert.equal(e.getText(), "right!");
});

test("repeated insertions remain draft edits and preserve earlier expanded content", () => {
	const e = editor("Start snipet:review");
	const get = snippets(["review", "done"]);
	assert.equal(completeOrExpand(e, get), true);
	e.insertTextAtCursor(" + snipet:review");
	assert.equal(completeOrExpand(e, get), true);
	assert.equal(e.getText(), "Start done + done");
	assert.deepEqual(e.getCursor(), { line: 0, col: 17 });
});

test("submission state is restored after insertion fails", () => {
	class FailingEditor extends Editor {
		override insertTextAtCursor(): void { throw new Error("insertion failed"); }
	}
	for (const disabled of [false, true]) {
		const e = new FailingEditor(new HeadlessTUI(terminal), theme);
		e.setText("snipet:review");
		e.disableSubmit = disabled;
		assert.throws(() => completeOrExpand(e, snippets(["review", "body"])), /insertion failed/);
		assert.equal(e.disableSubmit, disabled);
	}
});
