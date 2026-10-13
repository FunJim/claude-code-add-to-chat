# A band whose height does not follow the selection

**Superseded** by [ADR 0005](0005-everything-in-a-pane.md): add-to-chat now draws in a pane. The reason below still shapes the pane: its first row is always one row, and it opens before anything is selected.

In the fullscreen terminal the band always has its one head row, showing a hint when nothing is selected and the "Add to chat" offer in the same row when something is. The row is cut to fit and never wraps. Rows below it (the Comment field, the list) appear only on a click.

A selection is readable while the mouse is still dragging, and a mod gets no "released" signal. When the band grew a row as soon as the poll saw a selection, a transcript scrolled to the bottom moved up a row under the held mouse, and the drag ended a line lower than the person aimed. The end-to-end suite reproduces it by pausing 900ms mid-drag.

## Considered Options

- **Wait until the selection has been stable (e.g. 600ms) before offering**: rejected. It makes the jump rarer, not impossible, and delays every offer.
- **Show the offer only outside the transcript's movement, e.g. in the status line**: rejected. The status line is narrow and shared with other mods, and can't hold buttons.

## Consequences

- The band takes one row of the fullscreen terminal at all times.
- In a narrow terminal the head row drops words in a fixed order to keep at least 12 cells of preview.
