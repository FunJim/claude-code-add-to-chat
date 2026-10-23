# A band-shaped pane waits for the engine's placement choice

Where a pane sits is the surface's to say: docked beside a fullscreen transcript from 110 columns, inline above the prompt below that and on the main screen. `$.ui.open` takes no placement — its `rows` and `columns` are requests about one seating or the other — and a `ui.open` hook may rewrite only the title and the focus. The person can drag or key a dock's width, but nothing repositions a docked pane. So a mod cannot offer the pane's inline form on a wide terminal, though people ask for it as their default.

## Considered Options

- **Ask the engine for a placement option** (chosen): [anthropics/claude-code#99404](https://github.com/anthropics/claude-code/issues/99404) asks for `placement?: 'auto' | 'inline' | 'dock'` on `$.ui.open`, `auto` as today; add-to-chat's case is commented there (2026-10-23). `rows` and `columns` are already "a request, not a grant", so the option follows a shape the engine has; and a person's own choice, remembered the way a dragged dock width is kept, would serve better than a mod's default.
- **Draw in the band (`AbovePrompt`) instead of a pane**: possible today, but it reopens [ADR 0005](0005-everything-in-a-pane.md)'s rejected design — the band's first row must stay one row high ([ADR 0002](0002-one-row-band.md)) or the transcript moves under a dragging mouse, previews cut to fit, the Comment field and list unfold below the prompt — and gives up the pane's Esc-to-close, ctrl+x tab and close mark.
- **A setting promising it, with nothing behind it yet**: rejected; there is no way to make it true today, so the setting would say what it cannot do until the engine lands.

## Consequences

- On a wide fullscreen terminal the pane stays docked; the inline form shows only below 110 columns or on the main screen, where the mod cannot read the selection anyway ([ADR 0001](0001-fullscreen-only-polled-selection.md)).
- When the engine ships a placement option, or remembers a person's repositioning of a pane as it keeps a dragged dock width, add the choice beside keeping the person's closed choice (`isPaneDismissed`), and record the option in [the notes](../claude-code-notes.md).
- After a Claude Code update, check that issue and the API for it.
