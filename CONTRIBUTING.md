# Contributing

Thanks for helping. Bug reports with a way to reproduce them are as welcome as pull requests.

## Setting up

You need Claude Code (≥ 2.1.296, with mods) and Node ≥ 23.6, which runs the TypeScript as is. For the end-to-end suite, also tmux, and [Herdr](https://herdr.dev) for the full run.

```sh
git clone https://github.com/FunJim/claude-code-add-to-chat
cd claude-code-add-to-chat
npm install        # only TypeScript and Node's types, for type-checking
```

Try your copy live, in fullscreen (the only mode where a mod can read the selection):

```sh
CLAUDE_CODE_NO_FLICKER=1 claude --plugin-dir ./add-to-chat
```

Edits under `add-to-chat/` hot-reload into that session at the end of each turn.

## Checks

| Command | What it runs |
|---|---|
| `npm run validate` | `claude plugin validate`: the manifests and the module source, read the way the engine reads them |
| `npm test` | `claude plugin test add-to-chat`: the unit tests in `add-to-chat/tests/` against the real engine |
| `npm run e2e:unit` | the end-to-end harness's own tests |
| `npm run typecheck` | `tsc` over `e2e/` |
| `tsc -p add-to-chat` | the mod's types; needs `add-to-chat/.claude-plugin/types/`, which the engine writes when it first loads the mod |
| `npm run e2e` | the end-to-end suite in real Claude Code sessions ([e2e/README.md](e2e/README.md)); about 8 minutes on Herdr, 1.5 on tmux (`npm run e2e:tmux`), a few cents of `haiku` |

CI runs everything but the end-to-end suite. Run that yourself when you change what the person sees or what the model is sent.

## Where things are

```
add-to-chat/                  the mod (what gets installed)
  .claude-plugin/plugin.json  manifest, userConfig, types
  hooks/register.tsx          engine glue: every hook and every `$` call
  hooks/*.ts(x)               pure modules: selection, annotations, rows, send,
                              pane (the view), prompt-row (a sent prompt's 📎 row),
                              history (sent prompts' Annotations), excerpt (markdown
                              matching, marks, Citations), template, text (terminal
                              cells), labels, hash
  types/index.d.ts            the PluginState contract
  tests/                      unit tests; world.ts stands in for the engine
e2e/                          end-to-end harness, scenarios and showcase
docs/                         design, glossary, Claude Code notes, ADRs
.claude-plugin/marketplace.json   makes the repo installable
```

Start with [docs/design.md](docs/design.md). Use the [glossary](docs/glossary.md)'s words (Annotation, Excerpt, Source, Comment, Citation, Annotation Template) in code and prose.

## Rules the engine imposes

- **Every `$` call lives in `hooks/register.tsx`.** The engine follows `$` only into functions of the same file, never across an import, and `on()` takes a function literal or a function name. Logic goes in the pure modules, which take values and return values.
- No DOM, no Node inside `add-to-chat/`. Everything outside goes through `$`; elements come from `$.ui.resolve(e)`.
- State goes in `$.state` (`atom`/`read`/`update` from `'claude-code'`), never module variables: a reload starts the module over. Every key is declared in `types/index.d.ts`. Render hooks only read state. The deliberate module variables are two caches render hooks fill in `register.tsx`: `roles` ([design](docs/design.md#source)) and `promptRows` ([design](docs/design.md#the-panes-history)).
- `session.start` fires again on every reload; the engine drops the previous load's timers.
- Node's type stripping runs the TypeScript: no enums, no parameter properties.
- The API (`claude-code.d.ts`) is early access and is the authority over the docs; grep it by symbol name.

## Tests

- A change in behaviour comes with a unit test in `add-to-chat/tests/`. UI tests loop over `['terminal', 'desktop'] as const`.
- In `tests/world.ts`, answers to calls on `$` (`ui.selection`, `prompt.read`, `fs.read`, `store.*`, …) are `{ value }` / `{ deny }`; answers to events (`prompt.submit`, `prompt.fill`, `ui.focus`, `session.start`) are the event's result. Every `on(...)` must be registered before a test's first `$` call. The selection poll runs on the mocked clock: `tick(w)` advances it.
- Something the person sees or the model reads gets an end-to-end scenario in `e2e/scenarios/`: see [e2e/README.md](e2e/README.md#writing-a-scenario).
- After a Claude Code update, run `npm run e2e`, re-record the fixture transcript with `npm run e2e:record`, and check [docs/claude-code-notes.md](docs/claude-code-notes.md) still holds.

## Pull requests

- One change per pull request, with its tests; `npm run validate && npm test && npm run e2e:unit && npm run typecheck` passing.
- Say in the description whether you ran `npm run e2e`, and on which driver.
- A decision with alternatives worth remembering gets an ADR in `docs/adr/`.
- Add a line under "Unreleased" in [CHANGELOG.md](CHANGELOG.md) for anything a user would notice.

## Releasing

Bump `version` in `add-to-chat/.claude-plugin/plugin.json`, move "Unreleased" in the changelog under the new version, tag `vX.Y.Z` and push the tag.
