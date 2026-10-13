# Design

How add-to-chat behaves and why. Terms (Annotation, Excerpt, Source, Comment, Citation, Annotation Template) are defined in the [glossary](glossary.md). The Claude Code behaviours this design rests on, and how they were measured, are in [claude-code-notes.md](claude-code-notes.md). Decisions with alternatives worth recording are in [adr/](adr/).

The model is Codex's "Add to chat": select text → a floating "Add to chat" button → an optional "Add an optional comment…" field → numbered bubbles ①② on the selected text → an "N annotations" chip above the input → send.

## Requirements

- Claude Code with function-hook mods (built against 2.1.296).
- Fullscreen mode (`CLAUDE_CODE_NO_FLICKER=1`). Only there can a mod read the mouse selection: [ADR 0001](adr/0001-fullscreen-only-polled-selection.md).

## Collecting an Annotation

### Following the selection

`session.start` starts a 250ms `$.clock.every` poll of `$.ui.selection()` (`{ text, requestId? }`, where `requestId` is the transcript row the selection lies in). A reload fires `session.start` again and the engine drops the previous load's timers, so one poll runs at a time. When `$.ui.selection()` returns `undefined` (not fullscreen) the poll does nothing.

A selection outlives its highlight: Esc, a click elsewhere or typing take the highlight down, but `$.ui.selection()` keeps returning it until text is selected again or the next prompt's turn ends. So the mod remembers the `text + requestId` it last added or ignored (`handled`), and offers a selection only when it differs. `handled` survives a submit: between submit and the end of that turn the selection still returns what was just added. Selecting the same text in the same row twice cannot add it twice; that is accepted.

### The band

In the fullscreen terminal a band sits above the prompt with one head row that is always there:

- nothing selected: a dim hint, `select text in the transcript to add it to chat · /add-to-chat`;
- a selection to offer: `[ ✚ Add to chat ] "<Excerpt preview>" ✕ ignore`;
- Annotations pending: `📎 N annotations ▸` and the send hint (or `[ Send ]`, see [An empty prompt](#an-empty-prompt)) at the right.

The head row is cut to fit, never wrapped, so the band's height does not change with the selection. A selection is readable while the mouse is still dragging; a band that grew a row then would push a transcript scrolled to the bottom up under the mouse, and the selection would jump a line ([ADR 0002](adr/0002-one-row-band.md)). Rows below the head (the Comment field, the list) appear only after a click, when no drag is in progress. Outside fullscreen nothing can be selected, and the band shows only while Annotations are pending.

When the row is narrow, the right side shrinks first, in order: drop `nothing to add?`, then the short chip `📎 N ▸`, then `✕` alone; the preview keeps at least 12 cells.

`✕ ignore` marks the selection handled. Without it a selection one doesn't want would stay offered until the next turn ends.

### What can be added

The Excerpt is the selection's text with the mod's own drawing removed: the marks and Citations of [Marks](#marks-in-the-transcript) (`⁽⁾⁰-⁹`, `①-⑳`, `㉑-㊿`, U+200B) and the `📎 N annotations` line of a rewritten prompt row (and any head of it), all of which get selected along with the text. The band previews the Excerpt as it will be kept.

No offer is made, and `/add-to-chat` refuses, when:

- the same text from the same row is already pending;
- the selection has no `requestId` and its text comes from the prompt draft or from the band itself.

`/add-to-chat` does what the button does, from the keyboard. It answers with a toast and no output: command output enters the model's context.

Adding creates the Annotation at once, with no Comment, numbered one past the pending count.

## Comment

After adding, the band shows an `Input` (placeholder `Add an optional comment… (click here to type, Enter to save)`). Enter stores the Comment (empty means none). Esc returns the keyboard to the prompt and keeps the Annotation without a Comment.

A mouse click on a band `Button` does not give the band the keyboard: `autoFocus` and `$.ui.focus` cannot move it. The mod still calls `$.ui.focus` (it works when the band holds focus via ctrl+x tab); mouse users click the field, and the placeholder says so.

Esc raises no event. So while the field is open, a change to the prompt draft (the person went back to typing, or pressed `[ Send ]`) closes it. The draft as it stood when the field opened is the baseline, so `/add-to-chat` clearing its own command from the draft does not count as leaving.

## Source

| The selection lies in | Source |
|---|---|
| a reply (`AssistantMessage`) | `assistant` |
| a prompt the person typed: a `UserMessage` from the terminal, Remote Control or the SDK (`origin.kind` `composer`, `bridge`, `sdk`) | `user` |
| a tool's row: `ToolUse`, `ToolResult`, `ToolGroup`, `ToolProgress`, `AskUserQuestion` | `tool` |
| a row of Claude Code's own: `TurnDuration`, `CommandOutput`, `InfoNotice`, a `UserMessage` a notification, a plugin, a schedule or another session sent | `system` |
| no single row, or one no hook sees (bash mode, `/command` lines) | `transcript` |

Render hooks see each row's component; they record `requestId → role` in a module-level cache (`roles` in `register.tsx`), because render hooks may not write state. It is a derived cache, not drawing state: after a reload every row in view draws again and refills it, and a selection in a row out of view carries no `requestId` anyway. `requestId === "placeholder"` (a prompt row's first draw, before it has an id) is ignored.

An Annotation is `{ index, text, source, requestId?, comment? }`, where `requestId` is the row's: what `$.ui.selection()` and the row's render hook both call it (a message's uuid in the session's JSONL, a tool row's `tool_use_id`). The model cannot resolve it; the mod uses it for marks and to refuse duplicates. No surrounding context is attached.

## Marks in the transcript

While an Annotation is pending, the render hooks of `AssistantMessage` and `UserMessage` rows find its Excerpt in the row's markdown (`props.text`) and insert `⁽ⁿ⁾` after the first occurrence. Where it can't be found, the row starts with `ⁿ` (①②…) instead.

A selection is rendered text, so matching goes through a projection: the markdown is projected to the text the terminal draws, keeping each character's offset in the source, and the Excerpt is searched for whitespace-insensitively. Plain `indexOf` matched 11 of 17 measured selections; the projection matched all 17 ([notes](claude-code-notes.md#matching-excerpts-against-markdown)).

- `AssistantMessage`: drops `` ` ``, `*` and `_` at word edges; `[text](url)` → `text`.
- `UserMessage`: drops only `` ` `` and `*`; links stay as written.
- Code spans follow CommonMark: opening and closing backtick runs of equal length, never across a paragraph; an unmatched backtick is a literal.
- `~~strike~~` is drawn with its tildes, so `~` is kept.
- `_` inside a word (letters or digits on both sides) is literal.

The mark goes after the match's end, past closing markup right after it (`` ` ``, `**`, `](url)`), so it never lands inside inline code or a link. In a fenced code block it falls back to the row's start. Marks are wrapped in inline code (`` `⁽ⁿ⁾` ``) to take the terminal's code colour; next to another backtick a U+200B keeps the two spans apart.

After the prompt is sent the marks go and numbering restarts at 1.

## Managing the list

`📎 N annotations ▸` opens the list; each row is `① You  "…" — comment  ✕`, and `✕` removes it, renumbering the rest. Annotations cannot be edited.

Style: each row starts with a Claude-orange `▎`; numbers are bold orange; Sources are coloured (Claude orange for `assistant`, `suggestion` for `user`, `subtle` for the rest); Excerpts are italic in curly quotes; Comments and secondary actions are dim.

The band gets `maxRows` rows. The head row and the Comment field come first (with a single row, the field while it is open); the list goes below only with a row to spare and scrolls when long. A short terminal would otherwise spend its one row on the engine's "n more".

## Sending: the Annotation Template

On `prompt.submit` with Annotations pending, from a prompt the person typed (`origin.kind === 'composer'`), the Annotation Template is rendered and the list cleared.

- A template **with** `{{request}}` replaces the prompt: `next({ ...e, text })`. In the transcript the row would show the whole rendered template, so the `UserMessage` render hook draws the typed text plus a `📎 N annotations` line instead; with ctrl+o (`isExpanded`) the full text shows.
  - The row's `props.text` is byte-identical to the rewritten text, so the typed text is found by content: a map from the rewritten text's hash to `{ text, count }`. It lives in `$.store` so it survives `--resume`, is loaded into state on `session.start`, and keeps the latest 200 ([ADR 0004](adr/0004-originals-in-store.md)).
- A template **without** `{{request}}` leaves the prompt alone and goes beside it as context: `next({ ...e, context: [...(e.context ?? []), rendered] })`. The model reads it as hook additional context.

`userConfig.templatePath` names a template file, read with `$.fs.read` (`~/` expands to `$HOME`). Unset, or unreadable (with a toast), the built-in template is used. The syntax is a Mustache subset:

- top level: `{{request}}`, `{{count}}`, `{{annotations_json}}` (compact JSON: an array of `{ text, source: { role, requestId }, annotation? }`, Codex's shape with the Comment as `annotation`);
- `{{#annotations}}…{{/annotations}}`, inside which `{{index}}` (one-based), `{{text}}`, `{{source}}`, `{{requestId}}`, `{{comment}}`;
- `{{#name}}…{{/name}}` renders when the value is truthy, `{{^name}}…{{/name}}` when it is not;
- a section tag alone on its line leaves no blank line;
- values are inserted as-is, apart from `{{annotations_json}}`, which escapes `<`, `>` and `&` as `\u003c`, `\u003e`, `\u0026` (still valid JSON) so an Excerpt cannot close the tags around it.

The default template, Codex's wording adapted to point at the person's own prompts too and with the directive renamed to `:annotation`:

```markdown
# Response annotations:
Each item contains text selected from earlier in this conversation and where it was selected (`source.role`: your replies are `assistant`, the user's own prompts `user`, tool calls and results `tool`, Claude Code's notices `system`), and may include the user's note on it (`annotation`). Treat items as Annotation 1, Annotation 2, and so on in array order. Use every selection as context and address every note. For every annotation you address, include its inline directive `:annotation{index="N"}`, where N is its one-based array position (for example, `:annotation{index="1"}`). Do not use unstructured annotation labels.
<response-annotations>
{{annotations_json}}
</response-annotations>

## My request:
{{request}}
```

## An empty prompt

Enter on an empty (or all-blank) draft does not raise `prompt.submit`, and a prompt sent with `$.prompt.submit` skips the mod's own hooks. So with Annotations pending and an empty draft, the head row shows `[ Send ]`, which fills the draft with `(see annotations)` via `$.prompt.fill`; the person presses Enter and the prompt goes the normal way ([ADR 0003](adr/0003-send-fills-the-draft.md)). The poll reads `$.prompt.read().text` to know whether the draft is empty, writing state only on a change.

## Citations

The `AssistantMessage` render hook replaces `:annotation{index="N"}` in a reply with a coloured `ⁿ` (①…⑳㉑…㊿); directives inside code stay as written. Citations stay for good, unlike marks; a number refers to the Annotations of the prompt that reply answers. `turn.complete` calls `$.ui.invalidate('ui.render')`, since a long reply's row can stay as drawn mid-stream, before its directives were complete.

## Lifecycle

- `/clear` ends the session (`session.end`, reason `clear`) with no new `session.start`; the rows the pending Annotations point at are gone, so the list and the offer are cleared.
- A reload keeps `$.state` but the band does not redraw until state changes, so `session.start` clears the offer and the first poll writes it again.
- A turn in progress: an Annotation added then goes with the queued prompt, which Claude Code folds into the running turn.
- `/compact` keeps the pending list.

## State

All in `$.state`, declared in [`add-to-chat/types/index.d.ts`](../add-to-chat/types/index.d.ts):

| Key | Holds |
|---|---|
| `pending` | the Annotations to send |
| `candidate` | the selection the band offers, or `null` |
| `handled` | the key of the selection last added or ignored |
| `commenting` | the index whose Comment field is open, or `null` |
| `isListOpen` | whether the list is shown |
| `isDraftEmpty` | whether the prompt draft is empty |
| `originals` | rewritten prompt hash → `{ text, count }`, mirrored in `$.store` |

## Claude Code APIs used

The API (`claude-code.d.ts`, laid by the engine in `add-to-chat/.claude-plugin/types/`) is early access and is the authority over this table.

| For | Symbol |
|---|---|
| the selection | `$.ui.selection()` |
| the poll | `$.clock.every(ms, fn)` |
| the band | `ui.render` on `AbovePrompt`; `Box`, `Text`, `Button`, `Input` from `$.ui.resolve(e)` |
| marks, Citations, compact prompt rows | `ui.render` on `AssistantMessage`, `UserMessage` |
| rewriting or adding to the prompt | `prompt.submit` |
| `[ Send ]` and the draft | `$.prompt.fill`, `$.prompt.read` |
| `/add-to-chat` | `$.command.register`, `command.run` |
| redrawing after a turn | `turn.complete`, `$.ui.invalidate('ui.render')` |
| `/clear` | `session.end` |
| the template file | `$.fs.read`, `$.env.get('HOME')` |
| prompt originals across sessions | `$.store` |
| messages | `$.ui.toast` |
