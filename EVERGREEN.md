## Summary
- Insert Pi's loaded prompt templates inline with `snipet:<name>` and Tab.
- Expansion edits the draft; only explicit submission starts a model turn.
- Public touchpoints: session lifecycle, command registry, editor factories, Pi TUI.
- No internal Pi imports or undocumented Pi APIs are used by the extension.
- Fragile areas: editor composition, discovery timing, deletion keys, cached files.

## Intent
Reuse configured and package prompt templates anywhere in an existing draft,
without submitting it, losing surrounding text, or replacing an earlier editor's
submission wrapper. Partial names complete before expansion; ambiguous names
stop at their common prefix. Unknown names retain normal editor behavior.
The original implementation and trigger-change history confirm this is an
editor convenience, not a command runner or model/tool orchestration extension.

## Pi integration (public APIs)
`session_start` installs only in `ctx.mode === "tui"`.
`pi.getCommands()` supplies winning prompt names and `sourceInfo.path` values;
only prompt commands are read. `parseFrontmatter` removes metadata.
`ctx.ui.getEditorComponent/setEditorComponent` preserve prior editor factories;
`CustomEditor`, `Editor`, `matchesKey`, cursor/line access, insertion,
`disableSubmit`, and render requests implement draft editing.
The registry is refreshed on Tab because `resources_discover` follows startup.
Bodies and failed reads are cached until reload or a different winning path.

## Internal Pi APIs
None in runtime code: no deep imports, private fields, or undocumented Pi APIs.
Exported `Editor.prototype.handleInput` bypasses application shortcuts;
its escape/deletion semantics are a behavioral dependency.
Tests use exported SDK loader/runner APIs. The e2e-only preload overrides
`process.stdin.isTTY` to select Pi's TUI while stdin remains `/dev/null`;
this relies on CLI mode selection, not an internal Pi module.

## Weak points
Third-party editors must expose Pi editor methods. Arbitrary layouts are untested.
Zero-argument substitution mirrors Pi syntax locally and can drift.
Escape and Shift+Backspace semantics, grapheme deletion, discovery ordering,
registry precedence, and reload lifecycle changes need particular attention.
Live tests require credentials/network. Terminal decoding, Windows terminals,
compaction, and retries are not covered.

## Tests
`npm run test:evergreen` runs `npm test` then both live e2e editor configurations.
Pretest refreshes Pi development packages to npm latest and runs strict `tsc`.
Unit/editor tests protect completion, defaults, Unicode, suffix/cursor retention,
no submission, shortcut bypass, autocomplete dismissal, and state restoration.
The integration test loads the real extension with Pi's SDK, protecting TUI-only
installation, winning paths, filtering non-prompts, and unavailable-file warnings.
The e2e suite runs global `$EVERGREEN_PI_BIN` (fallback `pi` on PATH), using
required `$EVERGREEN_E2E_MODEL`, stdin ignored, and the actual installed editor.
It protects late discovery, missing reads, draft-only edits, preserved submission,
cache/reload, `/new`, and expanded text in real provider requests and saved sessions.
It requires successful assistant turns, not just reconstructed request payloads.
The fixture bypasses terminal decoding/global shortcuts, not snippet expansion
or provider transport. Package tests validate declared assets.
## Relevant changelog topics
Watch editor factories/CustomEditor, TUI keybindings and deletion sequences,
prompt arguments/frontmatter, getCommands/sourceInfo and collision precedence,
resources_discover ordering, session_start/reload, CLI mode selection/preloads,
and provider observation/session serialization used by the live tests.
