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

With nothing pending, the pane says `Nothing added yet.` under the first row. While any are pending and the pane is not drawn (closed, or waiting for room), the line under the prompt gets `📎 N annotations ↗` beneath Claude Code's own hint, so they are not forgotten; a click opens the pane, as `/add-to-chat` does. With the pane drawn its tabs say as much. The hook wraps the engine's drawing of the line (`next(e)` on `PromptHint`) as the 📎 row of a sent prompt does, so Claude Code's hint stays as it draws it. (`$.ui.status`, the pinned `⚠ add-to-chat: …` notice this replaced, takes text only: nothing in it can be pressed.)

`✕ ignore` marks the selection handled. Without it a selection one doesn't want would stay offered until the next turn ends.

### What can be added

The Excerpt is the selection's text with the mod's own drawing removed: the marks and Citations of [Marks](#marks-in-the-transcript) (`⁽⁾⁰-⁹`, `①-⑳`, `㉑-㊿`, U+200B) and the `📎 N annotations` line of a rewritten prompt row (and any head of it), all of which get selected along with the text. The pane previews the Excerpt as it will be kept.

No offer is made, and `/add-to-chat` adds nothing, when:

- the same text from the same row is already pending;
- the selection has no `requestId` and its text comes from the prompt draft or from the pane itself.

`/add-to-chat` opens the pane (again) and adds the selection if there is one to add, from the keyboard. It answers with a toast and no output: command output enters the model's context.

Adding creates the Annotation at once, with no Comment, numbered one past the pending count, and opens its tab.

## Comment

The open tab has an `Input` labelled `Comment`, holding the Annotation's Comment; it can be changed at any time before sending. What the field holds is the Comment, saved with Enter or not (empty removes it):

- Every edit is noted in `commentDrafts` (`onInput`), which no drawing reads, so typing redraws nothing. The notes are kept as the Comments when a field is left (another tab shown, one added or closed, the history or a sent prompt opened) and when the prompt is sent, before the template is filled.
- Enter saves at once. The terminal empties a field on Enter, keeps a field's text by its key, and fills it from `value` again only when `value` changes: a second Enter on an unchanged Comment would leave the field empty, and a third would save the emptiness. So each save bumps `commentSaves`, which is in the field's key (`comment-<index>-<saves>`): the field is drawn anew holding the Comment, and `$.ui.focus` gives the new key the keyboard back.

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

- top level: `{{request}}`, `{{count}}`, `{{annotations_xml}}` (one `<annotation index="N" source="…" requestId="…">` per Annotation, holding `<excerpt>` and, with a Comment, `<comment>`), `{{annotations_json}}` (compact JSON: an array of `{ text, source: { role, requestId }, annotation? }`, Codex's shape with the Comment as `annotation`);
- `{{#annotations}}…{{/annotations}}`, inside which `{{index}}` (one-based), `{{text}}`, `{{source}}`, `{{requestId}}`, `{{comment}}`;
- `{{#name}}…{{/name}}` renders when the value is truthy, `{{^name}}…{{/name}}` when it is not;
- a section tag alone on its line leaves no blank line;
- values are inserted as-is, apart from `{{annotations_xml}}`, which escapes `&`, `<`, `>` and `"` as entities, and `{{annotations_json}}`, which escapes `<`, `>` and `&` as `\u003c`, `\u003e`, `\u0026` (still valid JSON): an Excerpt cannot close the tags around either.

The default template puts the data first and the request last, as Anthropic's long-context guidance has it; each Annotation carries its own `index`, so the model never counts from zero; and it says what the directive is for and to use it instead of writing "Annotation N", the labels the earlier wording ("Treat items as Annotation 1, Annotation 2…") drew out. How the wording and the format were chosen (an eval of formats and markers over haiku and sonnet) is in [ADR 0007](adr/0007-xml-default-template.md).

```
<annotations>
{{annotations_xml}}
</annotations>

These are passages the user selected from earlier in this conversation (source: assistant = your reply, user = their own prompt, tool = a tool call or result, system = a Claude Code notice), each with the user's comment when they wrote one; their request below refers to them. Take every annotation into account and answer every comment.
When a sentence of your reply addresses an annotation, end it with :annotation{index="N"}, N being that annotation's index; the user's screen shows it as that annotation's number (①). Write it instead of naming "Annotation N" in prose, and keep it out of code blocks.

<request>
{{request}}
</request>
```

## An empty prompt

Enter on an empty (or all-blank) draft does not raise `prompt.submit`, and a prompt sent with `$.prompt.submit` skips the mod's own hooks. So with Annotations pending and an empty draft, the head row shows `[ Send ]`, which fills the draft with `(see annotations)` via `$.prompt.fill`; the person presses Enter and the prompt goes the normal way ([ADR 0003](adr/0003-send-fills-the-draft.md)). The poll reads `$.prompt.read().text` to know whether the draft is empty, writing state only on a change.

## Citations

The `AssistantMessage` render hook replaces `:annotation{index="N"}` in a reply with a coloured `ⁿ` (①…⑳㉑…㊿); directives inside code stay as written, as does one whose N names no Annotation: 0, or more than the prompt it answers was sent with. Which prompt a reply answers: a reply row first drawn after a prompt sent with Annotations, until the next prompt the person types (or another session), is noted with its text; the noting goes on past the turn's end, since a short reply can first draw after `turn.complete`. A row known to answer a prompt (in `replyCounts`) draws to that prompt's count, an older reply scrolled to included; a noted row known to answer none draws to the last prompt's count until the check lets it go. Once the main loop's turn has ended (`turn.complete` without an `agentId`), the noted rows are checked against the transcript, then and at each poll that finds rows noted since: those whose text is in an assistant message after the prompt and before the next one are kept with its original (`replies`), in `$.store`, so a resumed session knows them; the others are let go. The e2e `model` scenario checks that a reply row's text is found there: the row draws one text block, the message joins them. Reply rows read `replyCounts` (this conversation's reply rows → their prompt's count), never `originals`, and only a row with a directive reads it at all: `session.start` writes `originals`, and every reply redrawing, or drawing slower, just after a launch moved the transcript under a drag about to start ([notes](claude-code-notes.md#lifecycle)). `replyCounts` and `sessionPrompts` are written only when they change. A reply not known to answer one has every N from 1 drawn. Citations stay for good, unlike marks; a number refers to the Annotations of the prompt that reply answers. `turn.complete` calls `$.ui.invalidate('ui.render')`, since a long reply's row can stay as drawn mid-stream, before its directives were complete.

## Sent prompts

A prompt sent with Annotations keeps them: `originals` holds `{ text, count, annotations, replies }` by the hash of the rewritten text, mirrored in `$.store` ([ADR 0004](adr/0004-originals-in-store.md)), the latest 200. A prompt kept without them (sent before 0.3.0) draws the text-only row, with no `📎` button.

### The 📎 row

In the terminal the `UserMessage` hook does not rewrite a sent prompt's row into text: it hands Claude Code the prompt as typed (marks drawn) and wraps the engine's drawing, `next(e)`, with a row of its own beneath ([ADR 0006](adr/0006-wrap-the-prompt-row.md)):

```
❯ why does the parser fail here?         ← Claude Code's own row, its look and theme
  📎 2 annotations ↗                     ← the mod's: a Button
```

- **Hover**: the pointer anywhere on the `📎` row reveals a card of its Annotations (circled number, Source, Excerpt preview, Comment), up to six, then `+N more`. It is a `position: "absolute"` Box drawn `display: "none"` with `hover: { display: "flex" }`: no hook runs, nothing moves. It opens upward, over the prompt and the rows before it, since the rows drawn after this one would paint over a card below. It has the theme's `userMessageBackground`, so the rows beneath do not show through its blank cells.
- **Press**: opens the pane on that prompt (below). A press is the person's ask, so the pane is placed at any width.
- ctrl+o (`isExpanded`) shows the full rewritten text, as before. On other surfaces the row stays text: the prompt as typed and the `📎 N annotations` line.

### The pane's history

Below its first row (the offer, always one row) the pane shows one of three views, `paneMode`:

- **pending**: the tabs of the Annotations to send ([The pane](#the-pane)); under them, once a prompt has been sent with Annotations, `History (N) ›`.
- **history**: `← back`, `Sent with annotations`, and this conversation's prompts sent with them, newest first, the first nine answering to their digit.
- **sent**: `← back`, `You sent “…”`, the prompt's Annotations in tabs as in the pending view, read-only (the Comment as text, `No comment` without one), and `↑ jump to prompt`, which `$.ui.scroll`s the transcript to the prompt's row. The jump needs the row's requestId: known when the view was opened from the row, or once the row has drawn in this load (`promptRows`, a cache like `roles`); without one there is no jump.

The store keeps prompts from every session; the history lists those in this conversation's transcript. `sessionPrompts` holds their hashes: the user messages of `$.session.messages()` whose `hashText` is a key of `originals` (the text is the rewritten prompt byte for byte). It is read at `session.start`, after each `turn.complete` and when the history opens, and a prompt is added to it once sent. A `/branch` copies the transcript, so the fork's history still lists the prompts sent before it; `/clear` empties it.

`← back` goes from sent to the history, and from the history to pending. Adding a selection shows the pending view with the new tab, whatever the pane showed. The history views' words are the pane's own: selecting them offers nothing.

### Back in the prompt box

A rewind (Esc Esc) or ↑ through the prompt history puts a sent prompt back in the box as it was sent: for a prompt add-to-chat rewrote, the whole rendered template. Left there, sending it would wrap the template in the template again, and its Excerpts, now in the draft, would not be offered when selected (a selection that is the draft's own text is not). Claude Code fills the box itself, without `prompt.fill`, so the poll watches the draft: when it changes to text whose `hashText` is a key of `originals` with Annotations, the mod puts what was typed in its place (`$.prompt.fill`, replace) and the prompt's Annotations, Comments and all, back in `pending` after any there (one already pending is not added twice), and shows the first of them.

## Lifecycle

- `/clear` ends the session (`session.end`, reason `clear`) with no new `session.start`; the rows the pending Annotations point at are gone, so the list and the offer are cleared.
- A reload keeps `$.state` but the pane does not redraw until state changes, so `session.start` clears the offer and the first poll writes it again. The pane itself stays open.
- A turn in progress: an Annotation added then goes with the queued prompt, which Claude Code folds into the running turn.
- `/compact` keeps the pending list.
- `/branch` and `/resume` (as `/clear`) go on under another session id with `$.state` cleared and no `session.start` ([notes](claude-code-notes.md#lifecycle)). The poll reads `$.session.id()`; on a change it reloads `originals` from the store, so sent prompt rows draw what was typed again, and reads the new transcript's prompts for the history.

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
| `isPaneDrawn` | whether the pane is drawn (open and placed), as the poll last saw; while not, the line under the prompt counts the Annotations |
| `commentDrafts` | each Comment field's text by Annotation index, typed since the last save; read by no drawing |
| `commentSaves` | Comments saved with Enter so far: in the Comment field's key |
| `isDraftEmpty` | whether the prompt draft is empty |
| `originals` | rewritten prompt hash → `{ text, count, annotations?, replies? }`, mirrored in `$.store` |
| `sessionPrompts` | hashes of the rewritten prompts in this conversation's transcript, oldest first |
| `replyCounts` | each reply row known to answer one of them → its Annotation count; what reply rows read to bound their Citations |
| `paneMode` | what the pane shows below its first row: `pending`, `history`, or one `sent` prompt (its hash, open tab and row) |

## Claude Code APIs used

The API (`claude-code.d.ts`, laid by the engine in `add-to-chat/.claude-plugin/types/`) is early access and is the authority over this table.

| For | Symbol |
|---|---|
| the selection | `$.ui.selection()` |
| the poll | `$.clock.every(ms, fn)` |
| the pane | `$.ui.open`, `$.ui.panes`, `ui.render` on `Pane`, `ui.close`; `Box`, `Text`, `Button`, `Input` from `$.ui.resolve(e)` |
| opening it at the start | `ui.render` on `AbovePrompt` (drawing nothing), `viewport.isFullscreen` |
| the pending count, a click from the pane | `ui.render` on `PromptHint` wrapping `next(e)`; `Button` |
| marks, Citations, compact prompt rows | `ui.render` on `AssistantMessage`, `UserMessage` |
| the 📎 row and its card | `ui.render` on `UserMessage` wrapping `next(e)` (an `engine` node); `Box` `position: "absolute"`, `display: "none"`, `hover` |
| the jump to a sent prompt | `$.ui.scroll({ to: { requestId } })` |
| this conversation's prompts, and a session switch | `$.session.messages()`, `$.session.id()` |
| rewriting or adding to the prompt | `prompt.submit` |
| `[ Send ]` and the draft | `$.prompt.fill`, `$.prompt.read` |
| `/add-to-chat` | `$.command.register`, `command.run` |
| redrawing after a turn | `turn.complete`, `$.ui.invalidate('ui.render')` |
| `/clear` | `session.end` |
| the template file | `$.fs.read`, `$.env.get('HOME')` |
| prompt originals across sessions | `$.store` |
| messages | `$.ui.toast` |
