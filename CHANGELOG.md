# Changelog

All notable changes to add-to-chat are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- The pane's rows that end in an arrow — `History (N) ›` and the sent view's `↑ jump to prompt` — are its own words now: selecting them offers nothing, instead of adding that text as an annotation.
- A prompt that another plugin stops from being sent no longer pushes the oldest kept prompt out. That prompt's 📎 row and annotations are no longer lost.
- Past 200 kept prompts, a prompt kept by 0.4.0 or earlier keeps showing what was typed for the rest of the session, instead of the full template until the next restart.
- A comment typed and not yet saved stays with its annotation when a rewind or a step through the prompt history takes out the annotations an earlier prompt brought back. It used to be lost.

## [0.4.2] - 2026-10-17

### Fixed

- Two sessions answering the same prompt (a `/branch` sending it again) no longer lose each other's replies to it, which kept a reply's numbers to the prompt's annotations. Each reply is now kept on its own.
- Upgrading from 0.4.0 can no longer write the old list over a prompt another session has just kept: the old list is now only read.

## [0.4.1] - 2026-10-17

### Fixed

- Two sessions running at once no longer lose each other's sent prompts. Each kept the whole list in one place and wrote its own copy over it, so a prompt sent in one session lost its `📎` row, its place in the history and its annotations on ↑ once the other sent one. Each prompt is now kept on its own; the list kept by 0.4.0 is converted on first start.

## [0.4.0] - 2026-10-16

### Removed

- Custom Annotation Templates. The `templatePath` option is gone, and ignored if still set: every prompt goes with the built-in template, which is unchanged. A template of your own could drop your request or the annotations without a word, and one without `{{request}}` left the prompt out of the 📎 row, the history and ↑.

## [0.3.0] - 2026-10-15

### Added

- Sent prompts keep their annotations. Point at a sent prompt's `📎 N annotations ↗` for a card listing them; click it to open them in the pane, read-only, with a jump back to the prompt. `History (N) ›` in the pane lists every prompt sent with annotations. The history is this conversation's: a `/branch` keeps it, `/clear` starts it over.

### Changed

- Requires Claude Code 2.1.300 or later: the mod hooks `prompt.change`, which earlier versions do not have, and they do not load it. On them, stay on 0.2.1.
- The default template sends the annotations as XML, each with its index, before short instructions and your request in `<request>`; it no longer tells Claude to "treat items as Annotation 1, Annotation 2", which drew labels like `**Annotation 1**` into replies. The new `{{annotations_xml}}` gives custom templates the same escaped elements; `{{annotations_json}}` stays.
- A Citation whose number names no annotation of the prompt the reply answers (0, or past their count) stays as written instead of being drawn as a number.
- The offer's `✕ ignore` is now just `✕`: it dismisses this offer, nothing more; select the text again and it is offered. `/add-to-chat` adds a selection whose offer was dismissed too.
- A selection already added shows as `"…" added as ①` in the pane's first row.
- The pending count sits under the prompt, instead of in the status line, as a toggle of the pane: `📎 N annotations · hide pane`, or `· show pane` while it is hidden.

### Fixed

- After `/branch` or `/resume` inside a session, sent prompts drew the whole rendered template instead of what was typed.
- A comment typed and not saved with Enter was not sent; it now goes with the prompt, and is kept when you switch tabs.
- Pressing Enter twice in the comment field emptied it, and a third Enter deleted the comment.
- After you removed an annotation, or once its prompt was sent, the same text could not be added again: selecting it showed no offer. Closing a tab now offers its selection again, and text selected after a command or a turn is offered whether it was added before or not.
- Rewinding (Esc Esc) or recalling with ↑ a prompt sent with annotations put the whole rendered template back in the prompt box, so excerpts in it could not be selected again. You now get back what you typed, and its annotations are pending while the box shows that prompt: stepping on through the history or emptying the box takes them out, stepping back brings them again. A prompt recalled from another conversation comes back as typed, without its annotations.

## [0.2.1] - 2026-10-14

### Changed

- A cleaner pane: tabs read `1: Claude`, the number once, the open one bold and underlined, the others dim; the excerpt sits in a frame, upright and unquoted, under its number and where it came from (`① from Claude's reply`); the comment field reads `Add an optional comment…`, the footer `[ Send ] now, or type a prompt and press ↵`.
- The status line's `📎 N annotations` shows only while the pane is not drawn.

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

[Unreleased]: https://github.com/FunJim/claude-code-add-to-chat/compare/v0.4.2...HEAD
[0.4.2]: https://github.com/FunJim/claude-code-add-to-chat/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/FunJim/claude-code-add-to-chat/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/FunJim/claude-code-add-to-chat/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/FunJim/claude-code-add-to-chat/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/FunJim/claude-code-add-to-chat/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/FunJim/claude-code-add-to-chat/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/FunJim/claude-code-add-to-chat/releases/tag/v0.1.0
