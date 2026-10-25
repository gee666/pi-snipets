import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { test } from "node:test";
import {
	discoverAndLoadExtensions, ExtensionRunner, ModelRegistry, ModelRuntime,
	SessionManager, type ExtensionUIContext, type SlashCommandInfo,
} from "@earendil-works/pi-coding-agent";

test("loaded extension uses only winning Pi prompt paths and installs UI only in TUI mode", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "snippets-integration-"));
	try {
		const loaded = await discoverAndLoadExtensions([resolve("extensions/prompt-snippets.ts")], cwd, cwd);
		assert.deepEqual(loaded.errors, []);
		const models = await ModelRuntime.create({ authPath: join(cwd, "auth.json"), modelsPath: null, refreshOnCreate: false });
		const runner = new ExtensionRunner(loaded.extensions, loaded.runtime, cwd, SessionManager.inMemory(cwd), new ModelRegistry(models));
		const errors: unknown[] = [];
		runner.onError(error => errors.push(error));
		let factory: Parameters<ExtensionUIContext["setEditorComponent"]>[0];
		const warnings: string[] = [];
		const ui: ExtensionUIContext = {
			...runner.getUIContext(),
			getEditorComponent: () => factory,
			setEditorComponent: value => { factory = value; },
			notify: message => { warnings.push(message); },
		};
		const first = join(cwd, "first.md");
		const missing = join(cwd, "missing.md");
		writeFileSync(first, "---\ndescription: metadata\n---\nReview ${1:-changes}");
		const command = (name: string, path: string, source: SlashCommandInfo["source"] = "prompt"): SlashCommandInfo => ({
			name, source, sourceInfo: { path, source: "test", scope: "temporary", origin: "top-level" },
		});
		loaded.runtime.getCommands = () => [
			command("review", first), command("review", missing),
			command("ordinary", missing, "extension"), command("skill", missing, "skill"),
		];
		for (const mode of ["print", "rpc", "json"] as const) {
			runner.setUIContext(ui, mode);
			await runner.emit({ type: "session_start", reason: "startup" });
			assert.equal(factory, undefined, `${mode} must not install a TUI editor`);
		}
		runner.setUIContext(ui, "tui");
		await runner.emit({ type: "session_start", reason: "startup" });
		assert.equal(typeof factory, "function");
		assert.deepEqual(warnings, [], "shadowed and non-prompt paths must never be read");
		loaded.runtime.getCommands = () => [command("review", missing)];
		await runner.emit({ type: "session_start", reason: "new" });
		assert.equal(warnings.length, 1);
		assert.match(warnings[0], /Snippet snipet:review unavailable/);
		assert.deepEqual(errors, []);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});
