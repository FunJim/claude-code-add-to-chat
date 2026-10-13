# Everything in a pane, open from the start

add-to-chat draws its whole interface in one pane: the offer to add the selection, a tab per pending Annotation with its Excerpt and Comment, and `[ Send ]`. It draws nothing in the band above the prompt. The pane opens by itself at the start of a fullscreen session (the band's first fullscreen drawing calls `$.ui.open`), and stays open until the person closes it.

The band had room for one row without moving the transcript ([ADR 0002](0002-one-row-band.md)), so Excerpts showed only as previews cut to fit, and the list of Annotations unfolded below the prompt. A docked pane has the height of the transcript: whole Excerpts, a tab each, a Comment field that stays editable.

A pane that docks narrows the transcript, which moves the text under a mouse. Opening it when something is first selected would do that in the middle of a drag; opening it before anything is selected does not. For the same reason its first row is always one row, the hint or the offer.

## Considered Options

- **Keep the band for the offer, and open the pane from its count chip**: rejected by the person who asked for the pane. Two places to look, and the band's one row cut every preview short.
- **Open the pane on the first selection**: rejected. The transcript would narrow under the dragging mouse, the problem ADR 0002 solved.

## Consequences

- In a fullscreen terminal from 144 columns (110 once the person has opened the pane by hand) a sidebar is always there; narrower, the pane waits for `/add-to-chat`. Under 110 columns it is framed above the prompt instead of docked.
- A person who closes the pane keeps it closed (`isPaneDismissed`) until `/add-to-chat`; the status line keeps showing `📎 N annotations`.
- Supersedes [ADR 0002](0002-one-row-band.md).
