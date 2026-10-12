# Fullscreen only, with the selection polled

add-to-chat works only in fullscreen TUI and finds the person's selection by polling `$.ui.selection()` every 250ms, because that call is the only way a mod can see what was selected with the mouse. Outside fullscreen the terminal owns the selection and Claude Code never sees it, and a mod can write the clipboard but not read it. There is also no event when the selection changes, so the "Add to chat" button can only follow the selection by polling.

## Considered Options

- **Copy then `/add-to-chat <paste>` in non-fullscreen**: rejected. It loses the Source, and it is no better than pasting a quote by hand.
- **A static "Add to chat" button that reads the selection on click**: rejected. It doesn't show which Excerpt will be added before the click, and it takes up space when nothing is selected.

## Consequences

- The selection keeps returning the last value after a click or key takes the highlight down, so the mod remembers the last `text + requestId` it handled. Selecting the same text in the same row a second time can't be added again.
- If Claude Code adds a selection-change event or clipboard read, revisit this decision.
