# add-to-chat

[![CI](https://github.com/FunJim/claude-code-add-to-chat/actions/workflows/ci.yml/badge.svg)](https://github.com/FunJim/claude-code-add-to-chat/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[English](README.md) · [简体中文](README.zh-CN.md)

Codex's "Add to chat", for Claude Code. In the fullscreen terminal, select any text in the transcript (a line of Claude's reply, one of your own earlier prompts, a tool's output), add an optional comment, and it goes with your next prompt as a numbered annotation. Claude answers each one and cites it as ①②… in its reply.

```
⏺ The quick brown fox⁽¹⁾ jumps over the lazy dog, and Paris is the capital of France.

▎ [ ✚ Add to chat ] “capital of France” ✕ ignore            📎 1 annotation ▸ sent with your next prompt ↵
────────────────────────────────────────────────────────────────────────────────────────────────────────
❯ for each annotation, answer its comment or say what it refers to
```

Sent, the prompt row shows what you typed; Claude's reply cites each annotation:

```
❯ for each annotation, answer its comment or say what it refers to
  📎 2 annotations

⏺ The "quick brown fox" is a fox, a small wild canine. ①

  The "capital of France" refers to Paris, the country's capital city. ②
```

## Requirements

- Claude Code 2.1.296 or later, with mods.
- **Fullscreen mode**: `CLAUDE_CODE_NO_FLICKER=1`. Outside it the terminal owns the mouse selection and no mod can read it ([why](docs/adr/0001-fullscreen-only-polled-selection.md)).

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install add-to-chat --marketplace FunJim/claude-code-add-to-chat
```

Answer `y` to add the marketplace, then pick a scope. Start Claude Code with `CLAUDE_CODE_NO_FLICKER=1`, or set it under `env` in your settings.

## Use

A one-row band sits above the prompt: `▎ select text in the transcript to add it to chat`.

1. **Select** text in the transcript with the mouse. The band's row becomes `[ ✚ Add to chat ] "…" ✕ ignore`. Click the button, or run `/add-to-chat`.
2. **Comment** (optional): click the `Add an optional comment…` field that opens, type, press Enter. Or just go on.
3. Repeat. Each annotated text gets a mark like `⁽¹⁾` in the transcript; `📎 N annotations ▸` at the right of the band opens the list, where `✕` removes one.
4. **Send** your prompt as usual. Your message shows as what you typed plus `📎 N annotations`; ctrl+o shows what the model received. With nothing to type, `[ Send ]` puts `(see annotations)` in the prompt for you to send.

Claude's reply cites what it answers: `:annotation{index="1"}` in its text is drawn as ①.

The band stays one row high whatever you select. A band that grew when text got selected would push the transcript up under a mouse still dragging, and the selection would jump a line.

## The Annotation Template

By default your prompt is rewritten in Codex's format: a JSON array of the annotations, then `## My request:` and what you typed. To word it your own way, point the `templatePath` option at a file: `/plugin` → add-to-chat → configure, or in settings:

```json
{ "pluginConfigs": { "add-to-chat": { "options": { "templatePath": "~/.claude/add-to-chat.tmpl" } } } }
```

Templates use a small Mustache subset:

| Tag | Value |
|---|---|
| `{{request}}` | What you typed. A template **with** it replaces your prompt; a template **without** it is attached as hidden context beside your prompt |
| `{{count}}` | Number of annotations |
| `{{annotations_json}}` | `[{ "text", "source": { "role", "rowId" }, "comment" }]` |
| `{{#annotations}}…{{/annotations}}` | One block per annotation, with `{{index}}`, `{{text}}`, `{{source}}` (`claude` / `you` / `transcript`), `{{rowId}}`, `{{comment}}` |
| `{{#comment}}…{{/comment}}` | Only when the annotation has a comment (`{{^comment}}` for the opposite) |

An XML-style template that leaves your prompt untouched and goes in as context:

```
The user selected these excerpts from earlier in the conversation; their prompt refers to them by number.
{{#annotations}}
<annotation n="{{index}}" source="{{source}}">
<excerpt>{{text}}</excerpt>
{{#comment}}<comment>{{comment}}</comment>{{/comment}}
</annotation>
{{/annotations}}
```

Values are inserted as they are, except `{{annotations_json}}`, which escapes `<`, `>` and `&` so an excerpt can't close the tags around it. In a tag-based template of your own, an excerpt containing `</excerpt>` could break out ([SECURITY.md](SECURITY.md)).

Citations (①②…) appear only if your template asks Claude to write `:annotation{index="N"}`, as the default does.

## Limitations

- Fullscreen only (see above).
- Selecting the same text in the same row twice can't add it twice.
- An excerpt is marked where it first occurs in its row; text in a code block or across table cells is marked at the start of the row instead.
- A selection spanning several rows, or in a tool's output, has the Source "transcript": it can't be pinned to a reply or a prompt.

## Documentation

- [docs/design.md](docs/design.md): how it works and why
- [docs/](docs/): glossary, the Claude Code behaviours it relies on, decision records
- [CHANGELOG.md](CHANGELOG.md)

## Contributing

Issues and pull requests are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md). `npm run e2e` runs the end-to-end showcase in real Claude Code sessions ([e2e/README.md](e2e/README.md)).

## License

[MIT](LICENSE)
