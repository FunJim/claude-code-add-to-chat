# The offer goes when the highlight does

The offer for a selection — `✚ Add to chat` on the line under the prompt and in the pane's first row — goes when a prompt is sent (`prompt.submit`) or the box is cleared (`prompt.change` origin `clear`: a submit's clear, or Esc Esc over text, which empties it). The selection is marked handled, so the engine still reporting it does not bring the offer back; another selection does.

Everything else leaves it: typing, Ctrl+C, Esc Esc over an empty box (which opens the rewind menu, not a clear), a command, a press, the pane closed, a click the engine says nothing about. [ADR 0001](0001-fullscreen-only-polled-selection.md) measured why: the engine keeps returning the last selection after the highlight goes and raises no event when it goes; it reports a key or a click only by taking the highlight down before a command or a press runs.

## Considered Options

- **Close on every signal that reports the highlight down** — a command run, a press, the pane closed by hand: tried first and rejected by the person. The offer must outlive a press or a command: selecting a phrase, looking around (the pane, a command), and then adding is still the selection on screen.
- **Close on typing (`prompt.edit`)**: rejected. Selecting a phrase, clicking into the prompt and typing the request before adding is a flow the engine still supports — it reports the selection — and closing on the first keystroke would end it there.
- **A timer to catch the ones no event reports**: rejected. It would close offers still valid while the person reads what they selected.
- **Ask the engine for the highlight's state, or a deselect event**: worth doing if the API comes, the way the pane placement option is being asked for ([ADR 0011](0011-band-form-waits-for-the-engine.md)). Until then the five events are what there is.
- **Leave it lingering** (as 0.5.0 did): the offer stayed past a submit until the turn's end, and forever when the highlight went by a click the engine does not report.

## Consequences

- Ctrl+C, Esc Esc over an empty box (the rewind menu), a click on empty transcript, a command, a press: the offer stays. It goes at a submit or a clear, or when the engine reports the selection gone (the next prompt's turn end).
- Esc Esc over text raises the clear and closes it, with the text emptied.
- The ✕ stays: it dismisses the offer while the selection is still highlighted.
- `/add-to-chat` adds the selection as ever.
