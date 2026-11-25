# The desktop app adds a selection from its right-click menu

On the desktop app a selection is added from the menu the person opens on it: the mod's row there, `✚ Add to chat` with the Excerpt's preview as its second line, adds it and opens the pane on it, Comment field and all. The engine hands the hook the selection (`ContextMenu` props' `selection`: its text and its row's `requestId`), so this needs neither the poll nor fullscreen, the two conditions of [ADR 0001](0001-fullscreen-only-polled-selection.md), which still hold for the terminal.

Minimized to the app's widget (`Pane` props' `placement: "widget"`), the pane draws one line, `📎 N annotations` or `Nothing added yet.`: clicks may not reach a widget, so it holds no control.

## Considered Options

- **Leave the desktop out** (as before): the pane drew there, but said selections needed fullscreen, which the desktop has no way to give.
- **A row on every menu, reading `$.ui.selection()` when picked**: the desktop answers none, and a row on a link or a menu opened on nothing would add nothing.
- **A row only on selected text, from what the menu hands over** (chosen): the menu says exactly what was selected and where; the row is left out on a link, on code under the pointer with nothing selected, and on an Excerpt already pending, as the terminal's offer is.

## Consequences

- `ContextMenu` is drawn from Claude Code 2.1.325 or so; on older builds the hook never runs and the desktop pane's hint (`Select text in the transcript, right-click it, …`) points at a row that is not there. The floor stays 2.1.300 ([ADR 0009](0009-require-claude-code-2-1-300.md)): an unknown component in a matcher only makes validate warn that the hook never runs.
- `claude plugin test` on 2.1.300 refuses to mount a `ContextMenu`, so CI now runs the tests and the end-to-end suite on the build they were written against (2.1.332) and runs `claude plugin validate` alone on the floor. Pin both in `.github/workflows/ci.yml`.
- The end-to-end suite drives terminals only: the menu and the widget are covered by unit tests.
- `/add-to-chat` still answers from `command.run`, whose input names no surface: run from the desktop, it says fullscreen is needed.
