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
npm test
```

`npm test` first installs `@earendil-works/pi-coding-agent@latest` and `@earendil-works/pi-tui@latest` as direct development dependencies with `--save-dev --ignore-scripts`. It then runs `npm run check` for strict typechecking before the tests. A failed refresh or typecheck stops the run. Commit the resulting manifest and lockfile changes. No separate linter is configured.

Tests exercise argument defaults, partial and ambiguous completion, exact expansion, Unicode names, multiline insertion, suffix and cursor preservation, missing bodies, registry updates, and submission-state restoration. Editor tests use the installed Pi Editor with a headless terminal fixture. A package test checks declared extension files, their default factory exports, and required documentation assets.

These checks do not launch an interactive Pi session or validate prompt discovery, reload, or composition with other installed editor extensions. No manual terminal test is claimed.

Pi supplies both packages at runtime. Their peer ranges start at 1.4.0, the tested baseline. Tests target only npm latest, not an older-version compatibility matrix.

Before each release, rerun `npm test` against npm latest and update the `Tested against Pi` line to the actual installed version after checks pass. Inspect `npm pack --dry-run --ignore-scripts` and run `git diff --check`. Keep the repository's root `AGENTS.md` maintenance rules current.
