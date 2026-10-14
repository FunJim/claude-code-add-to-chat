#!/usr/bin/env node
// One command for the end-to-end showcase: boots the driver, opens a live
// view of it, runs the scenarios, and writes the report.
//
//   node e2e/run.ts [--driver herdr|tmux] [--model mock|haiku] [--only <regex>] [--keep] [--no-watch] [--list]
//   node e2e/run.ts --stop     take down what a --keep run left up
//
//   --driver   herdr (default when installed): every scenario, in an isolated
//              Herdr session of a fixed size; tmux: the basic scenarios.
//   --model    mock (default): a scripted model on a local port, no API call;
//              haiku: the real model, which also checks what it makes of the
//              template (a few cents)
//   --only     run the scenarios whose group or title matches <regex>
//   --keep     leave the sessions up afterwards, for a look around
//   --no-watch do not open the live view pane (inside Herdr) or wait at the end
//   --stop     stop the sessions, close the live view pane, remove the sandboxes
import { createWriteStream } from 'node:fs'
import { mkdir, readdir, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'
import { run as runTests } from 'node:test'
import { junit, spec } from 'node:test/reporters'

import { REAL_MODEL } from './harness/claude.ts'
import type { ModelTarget } from './harness/claude.ts'
import { run } from './harness/exec.ts'
import { E2E_DIR, E2E_PREFIX, REPO_DIR, keptDockColumns, removeSandboxes } from './harness/fixtures.ts'
import { HerdrHost, closeViewers, openViewer } from './harness/herdr.ts'
import { MockModel } from './harness/mock-model.ts'
import { summarize, verdict, writeReport } from './harness/report.ts'
import { setWorld } from './harness/scenario.ts'
import type { World } from './harness/scenario.ts'
import type { Driver, Host } from './harness/terminal.ts'
import { TmuxHost } from './harness/tmux.ts'

const { values: args } = parseArgs({
  options: {
    driver: { type: 'string' },
    model: { type: 'string', default: 'mock' },
    only: { type: 'string' },
    keep: { type: 'boolean', default: false },
    'no-watch': { type: 'boolean', default: false },
    list: { type: 'boolean', default: false },
    stop: { type: 'boolean', default: false },
  },
})

async function has(command: string) {
  return run('sh', ['-c', `command -v ${command}`]).then(() => true, () => false)
}

const scenarioDir = join(E2E_DIR, 'scenarios')
const files = (await readdir(scenarioDir)).filter(f => f.endsWith('.e2e.ts')).sort().map(f => join(scenarioDir, f))

if (args.list) {
  for (const f of files) console.log(f.replace(`${REPO_DIR}/`, ''))
  process.exit(0)
}

const isInHerdr = process.env.HERDR_ENV === '1'

if (args.stop) {
  await new HerdrHost(E2E_PREFIX, REPO_DIR, '/dev/null').stop()
  await new TmuxHost(E2E_PREFIX, '/dev/null').stop()
  if (isInHerdr) await closeViewers()
  await removeSandboxes()
  console.log('stopped')
  process.exit(0)
}

if (!(await has('tmux'))) throw new Error('tmux is required (both drivers host their terminals in it)')

// A dock width the person dragged is kept for every session, these too, and
// beats the width the pane asks for; the scenarios are laid out for that one.
const kept = await keptDockColumns()
if (kept !== undefined) {
  throw new Error(
    `~/.claude.json keeps a dragged pane dock width (pluginPanes.dockColumns: ${kept}), which every session uses instead of the ` +
      `width add-to-chat asks for, and the scenarios are laid out for. Remove that key (with Claude Code closed) and run again.`,
  )
}
const driver = (args.driver ?? ((await has('herdr')) ? 'herdr' : 'tmux')) as Driver
if (driver !== 'herdr' && driver !== 'tmux') throw new Error(`--driver herdr|tmux, not ${driver}`)
if (args.model !== 'mock' && args.model !== REAL_MODEL) throw new Error(`--model mock|${REAL_MODEL}, not ${args.model}`)

const startedAt = new Date()
const runDir = join(E2E_DIR, 'results', startedAt.toISOString().replace(/[:.]/g, '-'))
await mkdir(runDir, { recursive: true })
await rm(join(E2E_DIR, 'results', 'latest'), { force: true })
await symlink(runDir, join(E2E_DIR, 'results', 'latest'))
const narration = join(runDir, 'narration.log')

// The mock answers every session of the run; what it was sent and what it
// answered are kept beside the report.
const mock = args.model === 'mock' ? new MockModel(join(runDir, 'model-requests.jsonl')) : undefined
const model: ModelTarget = mock === undefined ? { kind: 'real' } : { kind: 'mock', url: await mock.start() }
const modelName = mock === undefined ? REAL_MODEL : 'mock'

const host: Host = driver === 'herdr' ? new HerdrHost(E2E_PREFIX, REPO_DIR, narration) : new TmuxHost(E2E_PREFIX, narration)
await host.start()
const world: World = { host, driver, runDir, model, results: [] }
setWorld(world)
await host.narrate(`add-to-chat e2e · driver ${driver} · model ${modelName} · ${startedAt.toLocaleString()}`)

// Inside Herdr, show the run beside the person's own pane, read-only.
const watch = !args['no-watch']
const viewer = watch && isInHerdr ? await openViewer(`while true; do ${host.watchCommand} 2>/dev/null || sleep 0.5; done`) : undefined
console.log(`\nadd-to-chat e2e · driver: ${driver} · model: ${modelName}`)
console.log(viewer === undefined ? `watch live:  ${host.watchCommand}` : `watching live in pane ${viewer}`)
console.log(`results:     ${runDir}\n`)

const claudeVersion = (await run('claude', ['--version'])).trim()
const stream = runTests({
  files,
  isolation: 'none',
  concurrency: 1,
  testNamePatterns: args.only === undefined ? undefined : [new RegExp(args.only, 'i')],
})
stream.compose(spec).pipe(process.stdout)
stream.compose(junit).pipe(createWriteStream(join(runDir, 'junit.xml')))
await new Promise<void>(resolve => stream.once('end', resolve))

const report = await writeReport(runDir, { driver, startedAt, claudeVersion, model: modelName, mainSize: host.mainSize, watchCommand: host.watchCommand }, world.results)
const s = summarize(world.results)
const outcome = `\n${verdict(s)}\nreport: ${report}`
await host.narrate(outcome)
console.log(outcome)

if (args.keep) {
  console.log(`sessions left up; watch: ${host.watchCommand} · take down: node e2e/run.ts --stop`)
} else {
  if (watch && process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    await rl.question('press Enter to close the showcase ')
    rl.close()
  }
  await host.stop()
  if (viewer !== undefined) await closeViewers()
  await removeSandboxes()
}
// Sessions a --keep run leaves up get no reply from here on.
await mock?.stop()
process.exitCode = s.fail === 0 ? 0 : 1
