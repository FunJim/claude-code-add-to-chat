# Claude Code behaviours add-to-chat relies on

Measured on Claude Code 2.1.296 (October 2026). The mod API is early access; after an update, re-run the end-to-end suite (`npm run e2e`), which exercises most of these. Each note says where the design depends on it.

How they were measured: a record-only probe mod (now [`e2e/probe/`](../e2e/probe/)) loaded beside add-to-chat in a fullscreen session in tmux or Herdr, with SGR mouse sequences written to the pane to drag-select (now [`e2e/harness/mouse.ts`](../e2e/harness/mouse.ts)). The probe logs the selection, every row's component, `requestId` and props, prompts and turns; what the model was sent is read from the session's JSONL transcript.

## The selection

- `$.ui.selection()` returns the **rendered** text, "what a copy would take", not the markdown. It returns `undefined` outside fullscreen.
- It keeps returning the last selection after the highlight goes (Esc, a click on empty transcript, typing in the prompt). It becomes `undefined` only when the next prompt's **turn ends**, not when it is submitted. → the mod remembers what it handled, across a submit, and needs `✕ ignore`.
- In a `onPress`, the selection is the same as before the click.
- `requestId` is the id the row's render hook gets: for a message, the `uuid` of its entry in the session's JSONL (each text block of a reply is an entry of its own); for a tool row, the `tool_use_id`; for a collapsed group, a made-up `collapsed-<uuid>`. Claude Code does not send these ids to the model.
- A selection across paragraphs or list items of one reply still has the row's `requestId`. One spanning rows, in the prompt or band, or in a row at the very edge of the transcript viewport, has none.
- A drag that ends on a line's last character takes the line end too, reaching into the next line, so it has no `requestId`.
- The selection is readable mid-drag. A 250ms poll sees intermediate states (`foo_b` → `foo_bar()`). → the band's height must not depend on it ([ADR 0002](adr/0002-one-row-band.md)).
- Marks the mod inserted (`⁽¹⁾`) are selected along with the text; the `⏺` before a reply is not.
- The poll is cheap: over 720 polls, `selection()` averaged 0.47ms (max 20ms).
- Auto-copy on select raises no `ui.copy` event.

## Matching Excerpts against markdown

What a selection gives against the row's `props.text`:

| Selection across | `selection().text` | Markdown |
|---|---|---|
| inline code, bold, a link | `npm test before you commit the change, then read the guide` | `` `npm test` before you **commit the change**, then read [the guide](https://…) `` |
| paragraphs of one reply | `MARKTEST here.\n\nSecond` | same (`\n\n` kept) |
| list items | `item one\n- list item two` | same (`- ` kept) |
| a prompt row | `…then read [the guide](https://example.com/guide) for details.` | backticks and `**` dropped, the link **as written** |

- `indexOf` on `props.text` matched 11 of 17 selections (including mid-drag states); every one across inline code, bold or a link failed. The projection described in [design.md](design.md#marks-in-the-transcript) matched 17/17.
- `~~strike~~` is drawn with its tildes. A lone ```` ``` ```` in a reply is not a code span opener (CommonMark: equal-length runs, not across a paragraph). `\w` counts `_`, so word-internal `_` must be judged with `\p{L}\p{N}`.
- A mark right after a code span (`` `let` `⁽¹⁾` ``) would merge the two spans into one double-backtick span; a U+200B between them prevents it.
- Inline-code marks draw in colour 153, the code colour.

Rows by type (adding from each, with Source and mark):

| Row | Component (`requestId`) | Source | Mark |
|---|---|---|---|
| a typed prompt; its compact or ctrl+o form | `UserMessage` (uuid; `placeholder` at first) | user | ✓ |
| reply text: headings, table cells, quotes, nested and numbered lists, inline code, `__bold__`, `_italic_`, `~~strike~~`, CJK, emoji | `AssistantMessage` (one uuid per text block) | assistant | ✓ |
| a table line across columns (with `│`), a fenced code block | `AssistantMessage` | assistant | at row start |
| tool call headers, results, diffs | `ToolUse` / `ToolResult` (`tool_use_id`) | tool | — |
| a collapsed group `Read 3 files, ran 1 shell command` | `ToolGroup` (`collapsed-…`) | tool | — |
| `Baked for 11s` | `TurnDuration` | system | — |
| subagent and background-command notifications | `UserMessage`, origin `task-notification` | system | — |
| a plugin command's output | `CommandOutput` | system | — |
| a prompt a plugin sent (`› Prompt from the … plugin` and its text) | `UserMessage`, origin `plugin`; the sending plugin's own hooks never see it | system | — |
| `!` bash mode, `/command` lines, reload notices, `/compact` rows, the logo | no `ui.render` | transcript | — |
| pasted long text | `UserMessage` | user | ✓ |
| the prompt draft, the band's own text | none | not offered | — |

## Prompts

- Enter on an empty or all-blank draft does **not** raise `prompt.submit`; a blank draft stays in the box.
- A prompt the mod sends with `$.prompt.submit` passes through **none of its own hooks** (`prompt.submit`, nor a `UserMessage` render), from an `onPress` or a `$.clock.after` alike, contrary to the doc comment. It shows as `› Prompt from the <plugin> plugin`; without `asUser: true` the model reads a "The <plugin> plugin sent a message: …" wrapper. `PromptSubmitArgs` takes no `context`. → [ADR 0003](adr/0003-send-fills-the-draft.md).
- After `prompt.submit` rewrites `text`, the `UserMessage` row first renders with `requestId: "placeholder"` and the **original** text, then ~100ms later with its uuid and the rewritten text, byte-identical to what was passed to `next`. ctrl+o (`isExpanded`) shows the rewritten text too. `next()`'s result carries no message id. → originals are found by content ([ADR 0004](adr/0004-originals-in-store.md)).
- `context` entries reach the model as `hook_additional_context` attachments.
- A prompt queued while a turn runs is folded into that turn and stored as a `queued_command` attachment; the template is applied when it is submitted.
- Multi-line input typed into the terminal needs bracketed paste with CR line ends.

## The band and focus

- A mouse click on a band `Button` does not give the band the keyboard: `$.ui.focus` answers `{ deny: "that site does not hold the keyboard" }` and `autoFocus` does nothing. Clicking an `Input` does let one type in it. Esc raises no event.
- When the band has one row, the engine shows only "↓ n more".
- A Fragment (`<>…</>`) inside a `Box` breaks the row's horizontal layout; pass children as an array. `borderStyle="quote"` adds an empty top border row.
- The first click after a layout change is sometimes swallowed.
- Terminal cells: CJK and characters with `Emoji_Presentation` (🚀 📎) take two; `⏺ ✚ ✕ ⎿ ① ▎` take one. `Extended_Pictographic` is the wrong test.

## Lifecycle

- A reload fires `session.start` again and drops the previous load's timers; `$.state` stays, but the band does not redraw until state changes.
- `/clear` raises `session.end` with reason `clear`, and no `session.start` follows.
- A new process starts with empty `$.state`; `$.store` persists.
- A resumed session draws its rows before `session.start`.
- In the ctrl+o view there is no band; a selection made there is offered after leaving it.
- `/branch`, `/resume` (in a session) and `/clear` go on under another session id (`$.session.id()`), clear `$.state`, and fire no `session.start`; `classic.SessionStart` fires with `source` `fork`, `resume` or `clear`, while `$.session.id()` still answers the old id. `$.store` is untouched. Measured 2026-10-14 by toasting from each hook in an e2e session.
- After `/branch` the transcript (`$.session.messages()`) is a copy of the one branched from; after `/clear` it is empty.
- A user message's `text` in `$.session.messages()` is the prompt as `prompt.submit` rewrote it, byte for byte: its `hashText` is the key `originals` keeps it under.
- `$.ui.scroll({ to: { requestId } })` from a pane Button's press scrolls the transcript to that row. In `claude plugin test`, the same call from a plugin's press is not routed to the test's `on('ui.scroll')` ("no implementation"); from the test's own `$` it is.

## Drawing around the engine

- `next(e)` resolves to an `engine` node; a hook can return it inside its own tree (`<Box>{engine}<Button/></Box>`), and Claude Code draws its component exactly as unwrapped (same ANSI, every theme). A `UserMessage` row wrapped this way keeps its `❯` and background.
- Claude Code raises no press for a transcript row itself: `ui.press` comes only from a plugin's `Button` or `Markdown` link.
- A `position: "absolute"` Box in a transcript row is painted over by the rows drawn after it (a card below its row is hidden); above, over the rows before, it shows. Its blank cells are transparent without a `backgroundColor`; the theme key `userMessageBackground` resolves (to the sent-prompt background).
- `hover: { display: "flex" }` on a Box drawn `display: "none"` in a keyed Box shows on pointer motion with no button held (SGR `35`); a hover `scope` reveals members in another site (a pane) too.
- Claude cannot write the tag `<cite …>`: it comes out as `(cite …`.

## Driving a terminal (for the test harness)

- Coordinates must count CJK and emoji as two cells.
- Mouse acts less than ~1.3s apart count as a double click and select a whole line.
- Don't press Esc before a drag, or put stray motion events in it.
- Wait for the screen to stop moving before dragging; a session starting up still scrolls.
- With a selection active, ctrl+u can extend the selection instead of clearing the prompt.
