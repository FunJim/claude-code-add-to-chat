# add-to-chat

A Claude Code mod (function-hooks plugin): select text in the fullscreen transcript, attach it with an optional Comment to the next prompt. Behaviour: `docs/design.md`. Terms: `docs/glossary.md` — use them (Annotation, Excerpt, Source, Comment, Citation, Annotation Template) in code and prose. Decisions: `docs/adr/`. Claude Code behaviours the design rests on: `docs/claude-code-notes.md`.

Setup, layout, checks, the engine's rules and the test conventions are in CONTRIBUTING.md:

@CONTRIBUTING.md

## Working here

- The API types are laid by the engine in `add-to-chat/.claude-plugin/types/claude-code/index.d.ts` (gitignored) once the mod has loaded; grep by symbol name. They are the authority over the docs.
- Before calling something done: `npm run validate && npm test && npm run e2e:unit && npm run typecheck && tsc -p add-to-chat`.
- A change to what the person sees or the model reads: run `npm run e2e` (or `--only <regex>`; it talks to a mock model, so add `--model haiku` when what the model makes of the template matters) rather than poking a session by hand, and add a scenario in `e2e/scenarios/`. Prefer `ctx.launchFixture()` and the rows in `e2e/fixtures/rows.ts`; assert on the probe (`claude.probe.pending()`, `.componentOf()`) and the transcript (`claude.transcript()`); select text from inside a line, never at a line end.
- Words the pane draws live in `hooks/labels.ts`; the e2e harness imports them, so change them there and nowhere else.
- `e2e/fixtures/transcript.jsonl` is committed: re-record it with `npm run e2e:record`, which strips machine context (`forFixture` in `e2e/harness/fixtures.ts`). Never commit settings, tokens or a raw session file.
