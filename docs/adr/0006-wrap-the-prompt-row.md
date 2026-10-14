# Wrap Claude Code's prompt row, never redraw it

A sent prompt's Annotations are shown again from its row: under the prompt, a `📎 N annotations ↗` button opens them in the pane, and a card lists them while the pointer is over it. The `UserMessage` render hook gets there by wrapping Claude Code's own drawing of the row (`next(e)`, an `engine` node) in a Box with the mod's row beneath, rather than returning a tree that draws the whole row itself.

A tree that replaces the row has to draw what Claude Code draws: the `❯`, the prompt's colours and background, how its lines wrap and indent. Measured (ANSI, side by side) it can be made to match, but only by copying colours that then ignore the person's theme, and by tracking whatever Claude Code changes in that row later. Wrapped, the engine's row is the engine's: byte for byte the same as an unwrapped one, in every theme.

## Considered Options

All were built and driven in real sessions before choosing (the e2e harness, a throwaway branch):

- **Redraw the row** (`Box`, `Markdown`, `Button`, colours copied from the measured ANSI): matched, but hard-coded colours and a copy of the engine's layout to keep up with. Rejected.
- **A click on the row itself**: Claude Code raises no press for a row; `ui.press` reaches only the plugin's own `Button`s and `Markdown` links. Not possible without one of the trees above.
- **Unfold the Annotations in place** under the row (`▸`/`▾`): worked; it lengthens the transcript and moves what is below, and long Excerpts take many rows. Not chosen; the card shows the same at a glance without moving anything.
- **Select the prompt, then `/annotations`**: worked (the selection carries the row's requestId); hard to discover. Not chosen.
- **The pane follows the viewport** (the prompt on screen, from `onScreen`): worked; the pane's content changes as one scrolls, which distracts. Not chosen.
- **A card that opens below the row**: Claude Code paints the rows after it over the card. Opened upward instead.

## Consequences

- Only the terminal draws the 📎 row; other surfaces keep the text-only row (`📎 N annotations` as a line).
- The row's `📎` line is the mod's Button: its text is still a clip line, so `excerptOf` drops it from a selection, arrow and all.
- `originals` now keeps each prompt's Annotations, a few kilobytes more per prompt in `$.store`, still capped at 200 prompts.
- `promptRows` (hash → requestId) is a second module cache filled by a render hook, beside `roles`.
