# The offer under the prompt takes no row of its own

While the pane is closed, the offer for a selection (`[ ✚ Add to chat ] “…” ✕`) is drawn on a row already there: with Annotations pending, on the count row after `📎 N annotations · show pane` (a row that comes and goes on clicks and sends, never mid-drag); else on Claude Code's own row under the prompt, the hint's, at its right end where the cells the hint leaves hold it, a preview cut to them, and in the hint's place, on the same row, where they do not. It never adds a row.

[ADR 0012](0012-the-pane-opens-asked.md) gave the offer a row beneath the hint, and so brought back what [ADR 0002](0002-one-row-band.md) ruled out: the poll sees a selection mid-drag, the row appears, the footer grows by one, and in fullscreen the transcript and the prompt move up a row under the held mouse. Measured on 2.1.332: a drag held 900ms on a reply's “Ran the” moved its row from 18 to 17 and ended a line lower (`Ran the subagent\n2. Read th`). A drag in the prompt box that strayed onto the hint row was offered (the hint is no draft), the row came, the box moved up, the drag took other text, and the offer came and went: the jumping people saw.

Claude Code draws its row first and what a `PromptHint` hook adds under it, so the hook draws a Box of no height there holding the offer `position: "absolute"`, `top: -1`: the offer paints on the hint's row, moves nothing, and its buttons take clicks. Under a tree with rows of its own (the count row) the floated Box does not show, so with the count row there the offer goes on it instead. `hint` leaves out what leads the row (its indent, the permission mode's label), so the room beside it is reckoned with the longest label kept clear.

A selection with no row whose every line is the draft's, the pane's, the hint's or the offer's, or lies below the prompt box's rule, is no longer offered: a drag from the box down onto the line under it is not transcript text. Found so, it stays so (`outside`, a state key) while the engine reports it: Backspace over selected words of the draft takes them out, and the selection, still reported, is the draft's text no more.

## Considered Options

- **A row of its own** (ADR 0012): moves the transcript under the mouse.
- **Wait for the selection to hold still before offering**: rejected by ADR 0002; rarer, not gone, and every offer later.
- **Keep a row for the offer at all times while the pane is closed**: one blank row under the prompt for everyone, for the moments something is selected.
- **The hint's `tail`**: drawn at the line's end, but text alone: no button to press.
- **On the hint's row, floated** (chosen): no row, no jump; the hint gives way only where it leaves no room.

## Consequences

- On a narrow terminal (the hint and the offer's button do not fit together) the hint is hidden while the offer stands; the permission mode's label stays, as Claude Code draws it outside the hook's row.
- The offer's place leans on how Claude Code lays out the line (its row first, the hook's after, the mode's label outside); the end-to-end suite checks it holds still and sits on the hint's row ([notes](../claude-code-notes.md#drawing-around-the-engine)).
- The count row (`📎 N annotations · show pane`) still has its own row: it comes and goes on clicks and sends, never mid-drag.
