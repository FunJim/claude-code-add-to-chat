# Design

How add-to-chat behaves and why. Terms (Annotation, Excerpt, Source, Comment, Citation, Annotation Template) are defined in the [glossary](glossary.md). The Claude Code behaviours this design rests on, and how they were measured, are in [claude-code-notes.md](claude-code-notes.md). Decisions with alternatives worth recording are in [adr/](adr/).

The model is Codex's "Add to chat": select text → a floating "Add to chat" button → an optional "Add an optional comment…" field → numbered bubbles ①② on the selected text → an "N annotations" chip above the input → send. In a terminal the floating parts live in a pane beside the transcript.

## Requirements

- Claude Code with function-hook mods (built against 2.1.296).
- Fullscreen mode (`CLAUDE_CODE_NO_FLICKER=1`). Only there can a mod read the mouse selection: [ADR 0001](adr/0001-fullscreen-only-polled-selection.md).

## Collecting an Annotation

### Following the selection

`session.start` starts a 250ms `$.clock.every` poll of `$.ui.selection()` (`{ text, requestId? }`, where `requestId` is the transcript row the selection lies in). A reload fires `session.start` again and the engine drops the previous load's timers, so one poll runs at a time. When `$.ui.selection()` returns `undefined` (not fullscreen) the poll does nothing.

A selection outlives its highlight: Esc, a click elsewhere or typing take the highlight down, but `$.ui.selection()` keeps returning it until text is selected again or the next prompt's turn ends. So the mod remembers the `text + requestId` it last added or ignored (`handled`), and offers a selection only when it differs. `handled` survives a submit: between submit and the end of that turn the selection still returns what was just added. Selecting the same text in the same row twice cannot add it twice; that is accepted.

### The pane

add-to-chat draws in a pane (`$.ui.open`, id `add-to-chat`), not in the band above the prompt. In a fullscreen terminal from 110 columns it docks beside the transcript; narrower, it is framed above the prompt.

```
                                                        ✕
[ ✚ Add to chat ] “so reading it failed” ✕ ignore
────────────────────────────────────────────────────────
1: Claude ✕   2: You ✕

② from your prompt
╭──────────────────────────────────────────────────────╮
│ Read the file missing.txt                            │
╰──────────────────────────────────────────────────────╯
Comment: Add an optional comment…
────────────────────────────────────────────────────────
[ Send ] now, or type a prompt and press ↵
```

Its first row is always there and always one row high:

- nothing selected: a dim hint, `Select text in the transcript to add it.`;
- a selection to offer: `[ ✚ Add to chat ] "<Excerpt preview>" ✕ ignore`, the preview cut to fit.

A selection is readable while the mouse is still dragging, so whatever the poll sees must not move the transcript: an offer that added a row to an inline pane, or a pane that docked in the middle of a drag and narrowed the transcript, would move the text under the mouse. So the offer takes the hint's row, and the pane opens by itself when the session starts, before anything is selected ([ADR 0005](adr/0005-everything-in-a-pane.md)): the band's first fullscreen drawing calls `$.ui.open`. Claude Code places a pane opened unasked only from 144 columns (110 once the person opened it by hand); below that it waits until `/add-to-chat` opens it. If the person closes the pane (its `✕`, ctrl+x x), it stays closed until they run `/add-to-chat`. Outside fullscreen nothing can be selected, and the pane does not open.

Below the first row, which change only on clicks:

- **Tabs**: one per pending Annotation, `1: Claude`, `2: You`…, the open one bold and underlined in the accent color, the rest dim. The first nine answer to their digit while the pane has the keyboard; Claude Code draws a plain `Button`'s hotkey before its label, so the label is the Source alone. From the tenth the label carries the number, `10: Claude`, with no hotkey. The open tab is the one added last, until another is picked. A tab's `✕` closes it, which removes its Annotation and renumbers the rest.
- **The open tab**: its circled number, as its marks in the transcript carry it, and where the Excerpt was selected (`② from your prompt`), the whole Excerpt, wrapped, in a dim rounded frame (no italics, no quotes: Excerpts are often code or tool output), and its Comment ([Comment](#comment)). A selection across that frame picks up its border, which the own-words check below ignores.
- **The footer**: `[ Send ] now, or type a prompt and press ↵` with an empty prompt ([An empty prompt](#an-empty-prompt)), else `They go with your next prompt ↵`.

With nothing pending, the pane says `Nothing added yet.` under the first row. While any are pending and the pane is not drawn (closed, or waiting for room), the status line shows `📎 N annotations`, so they are not forgotten; with the pane drawn its tabs say as much. Claude Code draws the line as one of its pinned notices, `⚠ add-to-chat: …`.

`✕ ignore` marks the selection handled. Without it a selection one doesn't want would stay offered until the next turn ends.

### What can be added

The Excerpt is the selection's text with the mod's own drawing removed: the marks and Citations of [Marks](#marks-in-the-transcript) (`⁽⁾⁰-⁹`, `①-⑳`, `㉑-㊿`, U+200B) and the `📎 N annotations` line of a rewritten prompt row (and any head of it), all of which get selected along with the text. The pane previews the Excerpt as it will be kept.

No offer is made, and `/add-to-chat` adds nothing, when:

- the same text from the same row is already pending;
- the selection has no `requestId` and its text comes from the prompt draft or from the pane itself.

`/add-to-chat` opens the pane (again) and adds the selection if there is one to add, from the keyboard. It answers with a toast and no output: command output enters the model's context.

Adding creates the Annotation at once, with no Comment, numbered one past the pending count, and opens its tab.

## Comment

The open tab has an `Input` labelled `Comment`, holding the Annotation's Comment. Enter stores it (empty removes it); it can be changed at any time before sending.

A mouse click on a `Button` does not give the pane the keyboard: `autoFocus` and `$.ui.focus` cannot move it there. After Add the mod still calls `$.ui.focus` on the new tab's field (it works when the pane holds the keyboard); mouse users click the field.

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

## Style

The accent colour (Claude orange) marks the open tab, whose label is bold and underlined, and the circled number before its Source; Claude Code draws each tab's hotkey digit in it too. The offer's preview is italic in curly quotes; the open tab's Excerpt is upright and unquoted in a dim rounded frame. Where an Excerpt was selected, hints, the Comment placeholder, secondary actions and tabs not open are dim.

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
- A reload keeps `$.state` but the pane does not redraw until state changes, so `session.start` clears the offer and the first poll writes it again. The pane itself stays open.
- A turn in progress: an Annotation added then goes with the queued prompt, which Claude Code folds into the running turn.
- `/compact` keeps the pending list.

## State

All in `$.state`, declared in [`add-to-chat/types/index.d.ts`](../add-to-chat/types/index.d.ts):

| Key | Holds |
|---|---|
| `pending` | the Annotations to send |
| `candidate` | the selection the pane offers, or `null` |
| `handled` | the key of the selection last added or ignored |
| `isPaneOpen` | whether the pane is open, as the poll last saw `$.ui.panes()` |
| `isPaneDismissed` | the person closed the pane; it stays closed until `/add-to-chat` |
| `paneTab` | the index of the Annotation whose tab the pane shows |
| `isDraftEmpty` | whether the prompt draft is empty |
| `originals` | rewritten prompt hash → `{ text, count }`, mirrored in `$.store` |

## Claude Code APIs used

The API (`claude-code.d.ts`, laid by the engine in `add-to-chat/.claude-plugin/types/`) is early access and is the authority over this table.

| For | Symbol |
|---|---|
| the selection | `$.ui.selection()` |
| the poll | `$.clock.every(ms, fn)` |
| the pane | `$.ui.open`, `$.ui.panes`, `ui.render` on `Pane`, `ui.close`; `Box`, `Text`, `Button`, `Input` from `$.ui.resolve(e)` |
| opening it at the start | `ui.render` on `AbovePrompt` (drawing nothing), `viewport.isFullscreen` |
| the pending count | `$.ui.status` |
| marks, Citations, compact prompt rows | `ui.render` on `AssistantMessage`, `UserMessage` |
| rewriting or adding to the prompt | `prompt.submit` |
| `[ Send ]` and the draft | `$.prompt.fill`, `$.prompt.read` |
| `/add-to-chat` | `$.command.register`, `command.run` |
| redrawing after a turn | `turn.complete`, `$.ui.invalidate('ui.render')` |
| `/clear` | `session.end` |
| the template file | `$.fs.read`, `$.env.get('HOME')` |
| prompt originals across sessions | `$.store` |
| messages | `$.ui.toast` |
