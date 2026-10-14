# End-to-end tests and showcase

Real Claude Code sessions with add-to-chat loaded, driven the way a person uses it: dragging the mouse over transcript text, pressing the pane's buttons, typing Comments and prompts. Each run checks what the model was sent and what the mod draws from its reply. The model is a [mock](harness/mock-model.ts) on a local port unless you ask for the real one.

```sh
npm run e2e          # Herdr if installed: every scenario (~8 min)
npm run e2e:tmux     # tmux: the basic scenarios (~1.5 min)
node e2e/run.ts --model haiku          # the real model: also checks it understands the template
node e2e/run.ts --only 'pane|model'   # scenarios whose group or title matches
node e2e/run.ts --keep                # leave the sessions up afterwards…
node e2e/run.ts --stop                # …and take them down later
node e2e/run.ts --list
```

No `npm install` is needed to run (Node ≥ 23.6 runs the TypeScript as is). Install only to type-check: `npm install && npm run typecheck`.

**Requires:** `claude`, `tmux`, Node ≥ 23.6; Herdr for the full suite. **Cost:** nothing by default: every session talks to the mock model, so no login or API key is needed (CI runs the full suite on Herdr this way, on Linux). With `--model haiku` the model scenarios cost a few cents; run that after a Claude Code update or a change to the template.

## What you see

- **Run from inside Herdr:** a pane opens beside yours showing the run live (read-only). Its left pane is the Claude Code under test. On the right, the top pane narrates each scenario and step, and the bottom pane holds a second session (main-screen, XML template, small terminal). Herdr's sidebar names each agent.
- **Run from anywhere else:** the runner prints `tmux attach -r -t atc-e2e-herdr` (or `atc-e2e-main` for tmux); attach to watch.
- **Results:** a spec-style list in the terminal, and in `e2e/results/<time>/` (also `e2e/results/latest`):
  - `report.md`: pass or fail per scenario, the environment, and on failure the screens;
  - `results.json`, `junit.xml`;
  - `evidence/`: the prompts the model read, its replies as written, screens;
  - `model-requests.jsonl`: with the mock, every request it answered and its reply (no keys or tokens);
  - `probe/`: what each session's probe recorded.

## Why it is reproducible

- **Fixed terminal sizes.** Herdr's pane size follows its client window, so the runner starts an *isolated* Herdr session (`atc-e2e`) whose client runs in a tmux window of 240×64 with `window-size manual`: the main pane is 133×63 on every machine and every run, whatever size your own terminal is. The tmux driver uses fixed-size sessions (160×50).
- **The pane's own width.** A dock width dragged by hand is kept in `~/.claude.json` (`pluginPanes.dockColumns`) for every session, these too, and beats the width add-to-chat asks for. The runner stops before starting if one is kept: remove the key, with Claude Code closed, and run again.
- **A recorded transcript.** Selection scenarios `--resume` [`fixtures/transcript.jsonl`](fixtures/transcript.jsonl), one real session holding every kind of row:
  - a prompt and replies (table, quote, lists, link, code, CJK, emoji, strikethrough);
  - tool calls, a collapsed tool group, a subagent, a background command and their notifications;
  - bash mode, a command's output, a plugin's prompt.

  [`fixtures/rows.ts`](fixtures/rows.ts) lists what each row shows and what adding from it must give. Re-record after a Claude Code update with `npm run e2e:record`. The recorder replaces paths and the session id with placeholders and drops what describes the recording machine (its installed skills, agents, MCP servers and tool list), so the file is safe to commit.
- **Acts confirmed by what Claude Code saw.** The [probe](probe/) plugin, loaded beside add-to-chat, records the selection, every row's component and `requestId`, add-to-chat's state, turns, toasts and prompts as they enter. Every mouse act is checked against it and redone if the terminal swallowed it. Three things are guarded against:
  - a drag over a still-moving screen;
  - two presses close enough to count as a double click;
  - a drag ending on a line's last character, which takes the line end too.
- **The model's part is scripted.** The mock ([ADR 0008](../docs/adr/0008-mock-model-for-e2e.md)) streams the same reply on every run: a Read or Bash call where the prompt asks for one, a file's text as written, a sentence ending in a Citation for each Annotation in the turn, a summary for `/compact`. With `--model haiku`, the reply text to select from still comes from a file the model copies, and assertions on what it wrote are on structure (the Citations) or on a word it must use (`ctx.isRealModel`).

## Layout

```
run.ts                 the one command: driver, live view, node:test run, report
harness/
  terminal.ts          Terminal and Host: what scenarios drive, whatever the driver
  herdr.ts tmux.ts     the two drivers
  claude.ts            ClaudeSession: launch, scroll, select, add, comment, pane, send…
  mock-model.ts        the mock Messages API: scripted, streamed replies
  mouse.ts screen.ts   SGR mouse input; finding text by terminal cell, in the transcript or the pane
  probe.ts             reading the probe's log
  transcript.ts        reading the session's JSONL: what the model was sent
  fixtures.ts          sandboxes under $TMPDIR/atc-e2e; recording and installing the fixture transcript
  scenario.ts          scenario(): a node:test test with narration, evidence, cleanup
  report.ts            report.md and results.json
scenarios/*.e2e.ts     pane, rows, filters, layout, lifecycle, model, history
fixtures/              the sandbox project, the XML template, the transcript and its rows
probe/                 the test-only plugin
```

## Writing a scenario

```ts
scenario('pane', 'what it shows', { drivers: ['herdr', 'tmux'] }, async ctx => {
  const claude = await ctx.launchFixture()          // or ctx.launch({ name }) for a fresh session
  await ctx.step('add a phrase from the reply')     // narration, shown live and in the report
  const added = await claude.add('so reading it failed')   // scrolls to it, drags over it, presses Add
  assert.equal(added.source, 'claude')
  await ctx.evidence('pane', (await claude.pane()).join('\n'))
})
```

- `drivers` says where it runs: tmux runs only the basic scenarios.
- Set `usesModel: true` when it sends prompts. The mock answers them by what they ask (read a file, run a command in backticks) and the Annotations they carry; assert on what only the real model would write under `if (ctx.isRealModel)`.
- Select text from inside a line, not at its end.
- Prefer assertions on the probe's state (`claude.probe.pending()`) and the transcript (`claude.transcript()`) over screen text.
- Match the pane's words through `add-to-chat/hooks/labels.ts` (`ADD_LABEL`, `clipLine(n)`, …), not literals.
