# pi-snipets

Insert loaded Pi prompt templates into the editor without submitting the draft.

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
