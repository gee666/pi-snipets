import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";

test("the package declares existing extension assets with a default factory", async () => {
	const root = new URL("../", import.meta.url);
	const manifest: unknown = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
	assert.ok(manifest && typeof manifest === "object" && "pi" in manifest);
	const pi = manifest.pi;
	assert.ok(pi && typeof pi === "object" && "extensions" in pi);
	assert.ok(Array.isArray(pi.extensions) && pi.extensions.length > 0);
	const entries: readonly unknown[] = pi.extensions;
	for (const entry of entries) {
		assert.ok(typeof entry === "string");
		const path = new URL(entry, root);
		assert.ok(path.href.startsWith(new URL("extensions/", root).href));
		assert.ok(statSync(path).isFile());
		const loaded: unknown = await import(path.href);
		assert.ok(loaded && typeof loaded === "object" && "default" in loaded);
		assert.equal(typeof loaded.default, "function");
	}
	for (const asset of ["README.md", "EVERGREEN.md", "LICENSE"]) {
		assert.ok(readFileSync(new URL(asset, root), "utf8").trim().length > 0);
	}
});
