# pi-snipets

Insert loaded Pi prompt templates into the editor without submitting the draft.

Requires Pi 1.4.0 or newer and Node.js 22.19 or newer.

Tested against Pi 1.4.0

## Install

```sh
pi install git:github.com/gee666/pi-snipets
```

## Usage

Type `snipet:<name>` anywhere in your draft, then press Tab.

- A partial name completes to the matching name or common prefix. Press Tab again once the name is exact to expand it.
- An exact name expands to the prompt body and leaves the cursor after it, preserving the rest of the draft.
- Unknown names fall through to normal editor behavior.

Uses Pi's loaded prompt templates, including configured and package prompts. Arguments are empty, with template defaults applied. Run `/reload` after changing prompt files or installing the extension.

## Development and validation

```sh
npm install --ignore-scripts
npm run test:evergreen
```

`npm test` first installs `@earendil-works/pi-coding-agent@latest` and `@earendil-works/pi-tui@latest` as direct development dependencies with `--save-dev --ignore-scripts`. It then runs `npm run check` for strict typechecking before the tests. A failed refresh or typecheck stops the run. Commit the resulting manifest and lockfile changes. No separate linter is configured.

Tests exercise argument defaults, partial and ambiguous completion, exact expansion, Unicode names, multiline insertion, suffix and cursor preservation, missing bodies, registry updates, and submission-state restoration. Editor tests use the installed Pi Editor with a headless terminal fixture. A package test checks declared extension files, their default factory exports, and required documentation assets.

`npm run test:evergreen` runs typechecking, unit/package/integration tests, then live e2e tests. The integration test loads the extension through Pi's SDK and checks TUI-only registration, winning prompt paths, ignored non-prompt commands, and missing-file warnings.

`npm run test:e2e` requires Python 3, the globally installed Pi selected by `EVERGREEN_PI_BIN` (default: `pi` on PATH), and `EVERGREEN_E2E_MODEL` (Pi's `provider/model:thinking` syntax). It never downloads a runtime and fails rather than skipping missing prerequisites. Pi handles credentials normally; the test does not read credential files.

Pi runs with stdin ignored and PTY output. A test-only preload marks stdin as a TTY to select interactive mode; a fixture feeds keys into the actual installed editor through public editor factories. This tests both the default editor and a prior submission wrapper, but not terminal byte decoding or global shortcuts. It checks late discovery, missing-file warnings and cached failures, draft-only expansion, frontmatter removal, caching, `/reload`, `/new`, two live model turns per configuration, provider-bound requests, and saved sessions. Successful assistant messages are mandatory; HTTP response statuses are checked when the transport emits them (WebSocket transports may not). Temporary sessions and request logs are deleted on completion. No separate build or lint task exists. See [EVERGREEN.md](EVERGREEN.md) for maintenance touchpoints.

Unit tests additionally check remapped deletion keys, bypassed application shortcuts, active autocomplete dismissal, repeated edits, and restoration of an already-disabled submission state. Arbitrary third-party editor layouts, RPC/print sessions, compaction, transport retries, and Windows terminals are not covered by the live suite. This extension neither changes the system prompt nor hooks model/tool execution; its expanded text becomes an ordinary user message.

Pi supplies both packages at runtime. Their peer ranges start at 1.4.0, the tested baseline. Tests target only npm latest, not an older-version compatibility matrix.

Before each release, rerun `npm test` against npm latest and update the `Tested against Pi` line to the actual installed version after checks pass. Inspect `npm pack --dry-run --ignore-scripts` and run `git diff --check`. Keep the repository's root `AGENTS.md` maintenance rules current.
