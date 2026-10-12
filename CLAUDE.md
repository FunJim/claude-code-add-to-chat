# add-to-chat

A Claude Code mod (function-hooks plugin): select text in the fullscreen transcript, attach it with an optional comment to the next prompt. Behaviour is specified in `docs/spec.md`; terms in `GLOSSARY.md` — use them (Annotation, Excerpt, Source, Comment, Citation, Annotation Template) in code and prose. Decisions live in `docs/adr/`.

## Layout

- `add-to-chat/` — the mod itself (what gets installed)
  - `.claude-plugin/plugin.json` — manifest, `userConfig`, `"types"`
  - `hooks/hooks.json` → `hooks/register.tsx` — the one hooks module (it may `import` sibling `.ts` files; never `import()`)
  - `types/index.d.ts` — `PluginState` contract; every `$.state` key the module names must be declared here
  - `tests/*.test.ts(x)` — run by `claude plugin test`
- `.claude-plugin/marketplace.json` — makes this repo installable
- `spikes/` — throwaway probe mods used to answer the spec's "待实测" questions; findings in `docs/spikes.md` (read it before touching selection, matching or submit logic)

## Commands

```sh
claude plugin validate add-to-chat   # manifest + module source, the way the engine reads them
claude plugin test add-to-chat       # *.test.ts against the real engine
tsc -p add-to-chat                   # needs .claude-plugin/types/, laid by the engine on first load
```

Try it live: `claude --plugin-dir ./add-to-chat` with `CLAUDE_CODE_NO_FLICKER=1` (fullscreen; selection reads need it).

## Rules the engine imposes

- The API (`claude-code.d.ts`) is early access and is the authority over the spec. Grep it by symbol name; the spec's table may drift.
- No DOM, no Node. Everything outside goes through `$`. Elements come from `$.ui.resolve(e)`.
- State goes in `$.state` (via `atom`/`read`/`update` from `'claude-code'`), never module variables — hot reload resets the module. Render hooks only read state; write from handlers or other events.
- `session.start` fires again on every reload; timers from the previous load are dropped by the engine.
- UI tests loop over `['terminal', 'desktop'] as const`.
- `.claude-plugin/types/` inside the mod is engine-generated and gitignored.
- `roles` in `register.tsx` is the one deliberate module-level variable: a cache render hooks refill (they may not write state). See spec §4.

## Tests

- `tests/world.ts` stands in for the engine beneath the plugin. Answers to calls on `$` (`ui.selection`, `prompt.read`, `fs.read`, `store.*`, …) are `{ value }` / `{ deny }`; answers to events (`prompt.submit`, `prompt.fill`, `ui.focus`, `session.start`) are the event's result.
- Every test `on(...)` must be registered before the test's first `$` call — hence one `ui.render` bottom in `start()` that records drawn row text, not one per `drawRow`.
- The selection poll runs on the mocked clock: `tick(w)` advances 250ms.

## Live check

The things tests cannot show (focus, colours, real `requestId`s) are checked in a tmux session driven with SGR mouse sequences; `spikes/tools/drag.sh` is the helper. Unset the parent's `CLAUDE_CODE_SESSION_ID` / `CLAUDE_CODE_MESSAGING_*` / `CLAUDE_CODE_CHILD_SESSION` env vars for the child.
