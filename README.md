# add-to-chat

[![CI](https://github.com/FunJim/claude-code-add-to-chat/actions/workflows/ci.yml/badge.svg)](https://github.com/FunJim/claude-code-add-to-chat/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[English](README.md) · [简体中文](README.zh-CN.md)

Codex's "Add to chat", for Claude Code. In the fullscreen terminal, select any text in the transcript (a line of Claude's reply, one of your own earlier prompts, a tool's output), add an optional comment, and it goes with your next prompt as a numbered annotation. Claude answers each one and cites it as ①②… in its reply.

```
⏺ The quick brown fox⁽¹⁾ jumps over the   │                                          ✕
  lazy dog.                                │[ ✚ Add to chat ] “capital of France” ✕
                                           │────────────────────────────────────────────
  Paris is the capital of France.          │1: Claude ✕
                                           │
                                           │① from Claude's reply
                                           │╭──────────────────────────────────────────╮
                                           ││ quick brown fox                          │
                                           │╰──────────────────────────────────────────╯
                                           │Comment: which animal is this?
                                           │────────────────────────────────────────────
                                           │They go with your next prompt ↵
───────────────────────────────────────────────────────────────────────────────────────────
❯ for each annotation, answer its comment or say what it refers to
```

Sent, the prompt row shows what you typed; Claude's reply cites each annotation:

```
❯ for each annotation, answer its comment or say what it refers to
  📎 2 annotations ↗

⏺ The "quick brown fox" is a fox, a small wild canine. ①

  The "capital of France" refers to Paris, the country's capital city. ②
```

## Requirements

- Claude Code 2.1.300 or later, with mods. Earlier versions do not load this version of the mod; on them, use 0.2.1.
- **Fullscreen mode**: `CLAUDE_CODE_NO_FLICKER=1`. Outside it the terminal owns the mouse selection and no mod can read it ([why](docs/adr/0001-fullscreen-only-polled-selection.md)).

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install add-to-chat --marketplace FunJim/claude-code-add-to-chat
```

Answer `y` to add the marketplace, then pick a scope. Start Claude Code with `CLAUDE_CODE_NO_FLICKER=1`, or set it under `env` in your settings.

## Use

A pane sits beside the transcript, open from the start (in a terminal under 144 columns, run `/add-to-chat` once to open it; under 110 it sits above the prompt instead). Its first row says `Select text in the transcript to add it.`

1. **Select** text in the transcript with the mouse. The pane's first row becomes `[ ✚ Add to chat ] "…" ✕`. Click the button, or run `/add-to-chat`; `✕` dismisses the offer.
2. The annotation gets a **tab** (`1: Claude ✕   2: You ✕`); press its digit to switch to it. The open tab shows the whole excerpt, where it came from, and a **Comment** field: click it and type (Enter saves it; switching tabs or sending keeps it too). Or leave it empty.
3. Repeat. Each annotated text gets a mark like `⁽¹⁾` in the transcript. Close a tab with its `✕` to remove that annotation. `📎 N annotations · hide pane` under the prompt counts them; click it to hide the pane or show it again.
4. **Send** your prompt as usual. Your message shows as what you typed plus `📎 N annotations ↗`; ctrl+o shows what the model received. With nothing to type, `[ Send ]` puts `(see annotations)` in the prompt for you to send.
5. **Look back**: point at a sent prompt's `📎 N annotations ↗` to see its annotations in a card; click it to open them in the pane, read-only, with `↑ jump to prompt`. `History (N) ›` under the pane's tabs lists every prompt you sent with annotations.

Claude's reply cites what it answers: `:annotation{index="1"}` in its text is drawn as ①.

The pane opens before you select anything and its first row never grows, so nothing moves under a mouse still dragging. Closed with its `✕`, it stays closed until you run `/add-to-chat`.

## The Annotation Template

By default your prompt is rewritten as the annotations in XML (`<annotations>`, one `<annotation index="N" source="…">` each with its `<excerpt>` and `<comment>`), a few lines telling Claude how to cite them, then what you typed in `<request>`. To word it your own way, point the `templatePath` option at a file: `/plugin` → add-to-chat → configure, or in settings:

```json
{ "pluginConfigs": { "add-to-chat": { "options": { "templatePath": "~/.claude/add-to-chat.tmpl" } } } }
```

Each annotation's source (`role`, `{{source}}`) is `assistant` (Claude's reply), `user` (your prompt), `tool` (a tool call or result), `system` (Claude Code's own rows: notices, command output, turn duration) or `transcript` (no single row).

Templates use a small Mustache subset:

| Tag | Value |
|---|---|
| `{{request}}` | What you typed. A template **with** it replaces your prompt; a template **without** it is attached as hidden context beside your prompt |
| `{{count}}` | Number of annotations |
| `{{annotations_xml}}` | The default's `<annotation>` elements, values escaped |
| `{{annotations_json}}` | Compact JSON in Codex's shape: `[{"text","source":{"role","requestId"},"annotation"}]`, where `annotation` is your comment |
| `{{#annotations}}…{{/annotations}}` | One block per annotation, with `{{index}}`, `{{text}}`, `{{source}}`, `{{requestId}}` (the row's id), `{{comment}}` |
| `{{#comment}}…{{/comment}}` | Only when the annotation has a comment (`{{^comment}}` for the opposite) |

An XML-style template that leaves your prompt untouched and goes in as context:

```
The user selected these excerpts from earlier in the conversation; their prompt refers to them by number.
<annotations>
{{annotations_xml}}
</annotations>
```

Values are inserted as they are, except `{{annotations_xml}}` and `{{annotations_json}}`, which escape what could close the tags around them. In tags of your own around `{{text}}` (inside `{{#annotations}}`), an excerpt containing `</excerpt>` could break out ([SECURITY.md](SECURITY.md)).

Citations (①②…) appear only if your template asks Claude to write `:annotation{index="N"}`, as the default does.

## Limitations

- Fullscreen only (see above).
- Selecting the same text in the same row twice can't add it twice.
- An excerpt is marked where it first occurs in its row; text in a code block or across table cells is marked at the start of the row instead.
- A selection spanning several rows has the Source `transcript`: it can't be pinned to one row.

## Documentation

- [docs/design.md](docs/design.md): how it works and why
- [docs/](docs/): glossary, the Claude Code behaviours it relies on, decision records
- [CHANGELOG.md](CHANGELOG.md)

## Contributing

Issues and pull requests are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md). `npm run e2e` runs the end-to-end showcase in real Claude Code sessions ([e2e/README.md](e2e/README.md)).

## License

[MIT](LICENSE)
