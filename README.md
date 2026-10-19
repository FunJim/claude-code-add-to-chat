# add-to-chat

[![CI](https://github.com/FunJim/claude-code-add-to-chat/actions/workflows/ci.yml/badge.svg)](https://github.com/FunJim/claude-code-add-to-chat/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[English](README.md) · [简体中文](README.zh-CN.md)

Codex's "Add to chat", for Claude Code. In the fullscreen terminal, select any text in the transcript (a line of Claude's reply, one of your own earlier prompts, a tool's output), add an optional comment, and it goes with your next prompt as a numbered annotation. Claude answers each one and cites it as ①②… in its reply.

https://github.com/user-attachments/assets/5044dd19-1656-4286-bbdd-48e61a96fe1a

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

Your prompt is rewritten as the annotations in XML, a few lines telling Claude how to cite them, then what you typed in `<request>`:

```
<annotations>
<annotation index="1" source="assistant" requestId="…">
<excerpt>Paris is the capital of France.</excerpt>
<comment>is this still true?</comment>
</annotation>
</annotations>

These are passages the user selected from earlier in this conversation (…)
When a sentence of your reply addresses an annotation, end it with :annotation{index="N"} (…)

<request>
answer my comment
</request>
```

Each annotation's `source` is `assistant` (Claude's reply), `user` (your prompt), `tool` (a tool call or result), `system` (Claude Code's own rows: notices, command output, turn duration) or `transcript` (no single row). Excerpts and comments are escaped, so an excerpt cannot close the `<annotations>` block ([SECURITY.md](SECURITY.md)). ctrl+o on a sent prompt shows what was sent.

The wording is fixed: it was chosen by an eval over haiku and sonnet ([ADR 0007](docs/adr/0007-xml-default-template.md)). Custom templates (the `templatePath` option) are no longer supported ([ADR 0010](docs/adr/0010-no-custom-templates.md)).

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
