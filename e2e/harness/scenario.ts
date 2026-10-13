// Declaring scenarios: node:test tests that know the driver they run on,
// narrate their steps to the showcase, keep evidence, and close the
// sessions they launched.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'

import { ClaudeSession } from './claude.ts'
import type { LaunchOptions } from './claude.ts'
import { FIXTURE_SESSION, installTranscript, sandbox } from './fixtures.ts'
import type { Driver, Host } from './terminal.ts'

export type Evidence = { label: string; file: string }

export type Result = {
  /** Where it was declared, so the report lists scenarios in file order. */
  order: number
  group: string
  title: string
  status: 'pass' | 'fail' | 'skip'
  ms: number
  usesModel: boolean
  error?: string
  evidence: Evidence[]
}

export type World = {
  host: Host
  driver: Driver
  runDir: string
  results: Result[]
}

let current: World | undefined
let declared = 0

export function setWorld(world: World) {
  current = world
}

function world(): World {
  if (current === undefined) throw new Error('scenarios run through e2e/run.ts, which sets up the driver')
  return current
}

export type Context = {
  /** One line of narration in the showcase and the report. */
  step(text: string): Promise<void>
  /** Launches Claude Code (add-to-chat + probe); closed when the scenario ends. */
  launch(options: Omit<LaunchOptions, 'cwd'> & { cwd?: string }): Promise<ClaudeSession>
  /** A fresh sandbox holding the fixture project. */
  sandbox(): Promise<string>
  /** Launches a session resumed on the recorded transcript, in a fresh sandbox. */
  launchFixture(options?: Partial<Omit<LaunchOptions, 'cwd' | 'resume'>>): Promise<ClaudeSession>
  /** Keeps text (a screen, a prompt) beside the report. */
  evidence(label: string, text: string): Promise<void>
}

export type ScenarioMeta = {
  /** Drivers it runs on; tmux runs only the basic ones. */
  drivers: readonly Driver[]
  /** Whether it calls the model (haiku): costs money, varies a little. */
  usesModel?: boolean
  timeoutMs?: number
}

function slug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function scenario(group: string, title: string, meta: ScenarioMeta, body: (ctx: Context) => Promise<void>) {
  const order = (declared += 1)
  const base = { order, group, title, ms: 0, usesModel: meta.usesModel ?? false }
  const skip = current !== undefined && !meta.drivers.includes(current.driver)
  // Listed in the report even when this driver does not run it.
  if (skip) current!.results.push({ ...base, status: 'skip', evidence: [] })
  test(title, { skip: skip ? `not on ${current?.driver}` : false, timeout: meta.timeoutMs ?? (meta.usesModel ? 300_000 : 180_000) }, async () => {
    const w = world()
    const started = Date.now()
    const evidenceDir = join(w.runDir, 'evidence', slug(`${group}-${title}`))
    const result: Result = { ...base, status: 'pass', evidence: [] }
    const sessions: ClaudeSession[] = []
    let sandboxes = 0

    const freshSandbox = () => {
      sandboxes += 1
      return sandbox(`${slug(title).slice(0, 40)}-${sandboxes}`)
    }
    const ctx: Context = {
      step: text => w.host.narrate(`    · ${text}`),
      sandbox: freshSandbox,
      launch: async options => {
        const cwd = options.cwd ?? (await freshSandbox())
        const session = await ClaudeSession.launch(w.host, w.runDir, { ...options, cwd })
        sessions.push(session)
        return session
      },
      launchFixture: async (options = {}) => {
        const cwd = await freshSandbox()
        await installTranscript(cwd)
        return ctx.launch({ name: 'fixture', ...options, cwd, resume: FIXTURE_SESSION })
      },
      evidence: async (label, text) => {
        await mkdir(evidenceDir, { recursive: true })
        const file = join(evidenceDir, `${slug(label)}.txt`)
        await writeFile(file, text)
        result.evidence.push({ label, file })
      },
    }

    await w.host.narrate(`▶ ${group} › ${title}`)
    try {
      await body(ctx)
      await w.host.narrate(`  ✔ passed (${((Date.now() - started) / 1000).toFixed(1)}s)`)
    } catch (error) {
      result.status = 'fail'
      result.error = error instanceof Error ? error.message : String(error)
      for (const s of sessions) {
        await ctx.evidence(`screen ${s.name}`, await s.screen().catch(() => '(gone)'))
        await ctx.evidence(`probe log ${s.name}`, s.probe.file)
      }
      await w.host.narrate(`  ✘ FAILED: ${result.error.split('\n')[0]}`)
      throw error
    } finally {
      result.ms = Date.now() - started
      w.results.push(result)
      for (const s of sessions) await s.close().catch(() => undefined)
    }
  })
}

export { assert }
