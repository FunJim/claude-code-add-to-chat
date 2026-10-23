# The pane opens asked; the offer on the line under the prompt

The pane no longer opens itself at the start of a session. It opens only asked: `/add-to-chat`, the count on the line under the prompt, a sent prompt's 📎 row. While it is closed, that line carries the offer for a selection — the same `✚ Add to chat` button, preview and ✕ as the pane's first row — beneath Claude Code's own hint.

[ADR 0005](0005-everything-in-a-pane.md) opened the pane from the start for two reasons, both gone:

- *Discoverability:* the pane was the whole interface, so an unopened pane meant an invisible mod. The offer now has a home that needs no pane: one row on the line under the prompt, which is there whenever Claude Code draws that line, and the count row follows the first Annotation added.
- *The drag:* a pane that docked when a selection first appeared would narrow the transcript under a dragging mouse, so it opened before anything was selected. Now every opening follows a release of the mouse or a key — a click on the count, the 📎 row, a command — so none can land mid-drag.

The person closing the pane (its `✕`, ctrl+x x) needs no `isPaneDismissed` any more: nothing opens unasked, so there is nothing to stay closed against. The state key is gone.

## Considered Options

- **Keep opening from the start, dismissible** (ADR 0005's rule): the pane narrows every wide terminal for everyone who never adds an Excerpt, and a new process re-opens what the person had closed.
- **Open on the first selection**: rejected by ADR 0005 — the transcript narrows under the dragging mouse. The line under the prompt offers instead, which moves nothing above it.
- **The pane opens asked** (chosen): the person's terminal is theirs until they ask; the offer stays reachable at any width.

## Consequences

- Claude Code places a pane opened asked at any width — docked beside a fullscreen transcript from 110 columns, inline above the prompt below — where an unasked opening waited undrawn under 144. On a narrow terminal `/add-to-chat` now shows the pane at once, in its inline form.
- Adding from the line under the prompt keeps the pane closed; the toast points at it, and the count row beside it opens it.
- The offer row shows only while the pane is not drawn: the pane's first row has it otherwise, and the line counts instead.
- A band-shaped pane by the person's choice still waits for the engine ([ADR 0011](0011-band-form-waits-for-the-engine.md)).
- Supersedes the opening rule of [ADR 0005](0005-everything-in-a-pane.md); the rest of it — the pane holds the whole interface, its first row one row — stands.
