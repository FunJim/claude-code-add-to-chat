# Documentation

- [design.md](design.md) — how add-to-chat behaves and why: the pane, Annotations, marks, the Annotation Template, Citations, state.
- [glossary.md](glossary.md) — the words used in code and prose: Annotation, Excerpt, Source, Comment, Citation, Annotation Template.
- [claude-code-notes.md](claude-code-notes.md) — Claude Code behaviours the design relies on, as measured; check them after a Claude Code update.
- [adr/](adr/) — decisions and the options they ruled out:
  - [0001](adr/0001-fullscreen-only-polled-selection.md) fullscreen only, the selection polled
  - [0002](adr/0002-one-row-band.md) a band whose height does not follow the selection (superseded by 0005)
  - [0003](adr/0003-send-fills-the-draft.md) `[ Send ]` fills the draft rather than sending
  - [0004](adr/0004-originals-in-store.md) what the person typed, kept in `$.store` by content
  - [0005](adr/0005-everything-in-a-pane.md) everything in a pane, open from the start
- [../e2e/README.md](../e2e/README.md) — the end-to-end suite and showcase.
- [../CONTRIBUTING.md](../CONTRIBUTING.md) — setting up, testing, the engine's rules.
