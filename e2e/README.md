# End-to-end tests and showcase

Real Claude Code sessions with add-to-chat loaded, driven the way a person uses it: dragging the mouse over transcript text, pressing the band's buttons, typing Comments and prompts. Each run checks what the model was sent and how it answered.

```sh
npm run e2e          # Herdr if installed: every scenario (~8 min)
npm run e2e:tmux     # tmux: the basic scenarios (~1.5 min)
node e2e/run.ts --only 'band|model'   # scenarios whose group or title matches
node e2e/run.ts --keep                # leave the sessions up afterwards…
node e2e/run.ts --stop                # …and take them down later
node e2e/run.ts --list
```

No `npm install` is needed to run (Node ≥ 23.6 runs the TypeScript as is). Install only to type-check: `npm install && npm run typecheck`.

**Requires:** `claude` (logged in), `tmux`, Node ≥ 23.6; Herdr for the full suite. **Cost:** the model scenarios run on `--model haiku`, a few cents per run; every other scenario resumes a recorded transcript and calls no model.

## What you see

- **Run from inside Herdr:** a pane opens beside yours showing the run live (read-only). Its left pane is the Claude Code under test. On the right, the top pane narrates each scenario and step, and the bottom pane holds a second session (main-screen, XML template, small terminal). Herdr's sidebar names each agent.
- **Run from anywhere else:** the runner prints `tmux attach -r -t atc-e2e-herdr` (or `atc-e2e-main` for tmux); attach to watch.
- **Results:** a spec-style list in the terminal, and in `e2e/results/<time>/` (also `e2e/results/latest`):
  - `report.md`: pass or fail per scenario, the environment, and on failure the screens;
  - `results.json`, `junit.xml`;
  - `evidence/`: the prompts the model read, its replies as written, screens;
  - `probe/`: what each session's probe recorded.

## Why it is reproducible

- **Fixed terminal sizes.** Herdr's pane size follows its client window, so the runner starts an *isolated* Herdr session (`atc-e2e`) whose client runs in a tmux window of 240×64 with `window-size manual`: the main pane is 133×63 on every machine and every run, whatever size your own terminal is. The tmux driver uses fixed-size sessions (160×50).
- **A recorded transcript.** Selection scenarios `--resume` [`fixtures/transcript.jsonl`](fixtures/transcript.jsonl), one real session holding every kind of row:
  - a prompt and replies (table, quote, lists, link, code, CJK, emoji, strikethrough);
  - tool calls, a collapsed tool group, a subagent, a background command and their notifications;
  - bash mode, a command's output, a plugin's prompt.

  [`fixtures/rows.ts`](fixtures/rows.ts) lists what each row shows and what adding from it must give. Re-record after a Claude Code update with `npm run e2e:record`.
- **Acts confirmed by what Claude Code saw.** The [probe](probe/) plugin, loaded beside add-to-chat, records the selection, every row's component and `requestId`, add-to-chat's state, turns, toasts and prompts as they enter. Every mouse act is checked against it and redone if the terminal swallowed it. Three things are guarded against:
  - a drag over a still-moving screen;
  - two presses close enough to count as a double click;
  - a drag ending on a line's last character, which takes the line end too.
- **The model's part is pinned.** Its reply text comes from a file it copies, and assertions are on structure (the template, the Citations), not on wording.

## Layout

```
run.ts                 the one command: driver, live view, node:test run, report
harness/
  terminal.ts          Terminal and Host: what scenarios drive, whatever the driver
  herdr.ts tmux.ts     the two drivers
  claude.ts            ClaudeSession: launch, select, add, comment, list, submit…
  mouse.ts screen.ts   SGR mouse input; finding text by terminal cell
  probe.ts             reading the probe's log
  transcript.ts        reading the session's JSONL: what the model was sent
  fixtures.ts          sandboxes under /tmp/atc-e2e, installing the recorded transcript
  scenario.ts          scenario(): a node:test test with narration, evidence, cleanup
  report.ts            report.md and results.json
scenarios/*.e2e.ts     band, rows, filters, layout, lifecycle, model
fixtures/              the sandbox project, the XML template, the transcript and its rows
probe/                 the test-only plugin
```

## Writing a scenario

```ts
scenario('band', 'what it shows', { drivers: ['herdr', 'tmux'] }, async ctx => {
  const claude = await ctx.launchFixture()          // or ctx.launch({ name }) for a fresh session
  await ctx.step('add a phrase from the reply')     // narration, shown live and in the report
  await claude.scrollTo('so reading it failed')
  const added = await claude.add('so reading it failed')
  assert.equal(added.source, 'claude')
  await ctx.evidence('band', (await claude.band()).join('\n'))
})
```

- `drivers` says where it runs: tmux runs only the basic scenarios.
- Set `usesModel: true` when it calls haiku.
- Select text from inside a line, not at its end.
- Prefer assertions on the probe's state (`claude.probe.pending()`) and the transcript (`claude.transcript()`) over screen text.
