# Changelog

All notable changes to add-to-chat are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-10-13

### Added

- The add-to-chat pane replaces the band above the prompt. Open from the start of a fullscreen session (or with `/add-to-chat`), it offers the selection in its first row and shows a tab per annotation: the whole excerpt, where it came from, and its comment, editable there. Closing a tab removes the annotation. The status line shows `📎 N annotations` while any are pending.

### Changed

- `{{annotations_json}}` is compact JSON, and each item is `{"text","source":{"role","requestId"},"annotation"}`: `rowId` is now `requestId`, the comment is `annotation`.
- Sources are `assistant`, `user`, `tool`, `system` and `transcript` (were `claude`, `you`, `transcript`); tool rows and Claude Code's own rows get their own. The template variable `{{rowId}}` is now `{{requestId}}`.

## [0.1.0] - 2026-10-13

First release, for Claude Code 2.1.296.

### Added

- A band above the prompt in fullscreen: select transcript text, `✚ Add to chat` (or `/add-to-chat`), `✕ ignore`.
- An optional Comment per Annotation; a list to review and remove them; `[ Send ]` for an empty prompt.
- Marks `⁽ⁿ⁾` on the selected text while Annotations are pending, found through a markdown projection.
- Citations: `:annotation{index="N"}` in Claude's replies drawn as ①②….
- The Annotation Template: a Codex-style default, or a Mustache-subset file (`templatePath`) that replaces the prompt or rides beside it as context.
- Prompt rows drawn as what was typed plus `📎 N annotations`, kept across `--resume`.

[Unreleased]: https://github.com/FunJim/claude-code-add-to-chat/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/FunJim/claude-code-add-to-chat/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/FunJim/claude-code-add-to-chat/releases/tag/v0.1.0
