// The Herdr driver: an isolated Herdr session whose client runs in a tmux
// window of a fixed size, so every pane has the same cells on every run and
// on every machine. A person watches it read-only through that window.
//
// Layout of its one tab ("add-to-chat e2e"):
//   ┌──────────────────────┬─────────────┐
//   │                      │ narration   │
//   │ main: Claude Code    ├─────────────┤
//   │                      │ side/small  │
//   └──────────────────────┴─────────────┘
import { appendFile, writeFile } from 'node:fs/promises'

import { commandLine, run, shellQuote, sleep, waitFor } from './exec.ts'
import { INHERITED } from './terminal.ts'
import type { Host, Key, Slot, SpawnOptions, Terminal } from './terminal.ts'
import { killSession, newSession } from './tmux.ts'

/** The tmux window the Herdr client draws into: the whole Herdr screen. */
const HERDR_SCREEN = { cols: 240, rows: 64 }

type Json = Record<string, any>

/**
 * Runs a Herdr command and resolves its `result`; `session` names an
 * isolated session, none means the one this process runs in.
 */
async function herdr(session: string | undefined, ...args: string[]): Promise<Json> {
  const text = (await run('herdr', [...(session === undefined ? [] : ['--session', session]), ...args])).trim()
  // A few commands (rename) answer nothing when they succeed.
  if (text === '') return {}
  const out = JSON.parse(text) as Json
  if (out.error) throw new Error(`herdr ${args.join(' ')}: ${out.error.message}`)
  return out.result as Json
}

const VIEWER_LABEL = 'add-to-chat e2e (live)'

/**
 * Opens a pane beside the caller's, in the person's own Herdr session,
 * running `command` (a read-only view of the run); resolves its id.
 */
export async function openViewer(command: string): Promise<string | undefined> {
  const viewer = (await herdr(undefined, 'pane', 'split', '--current', '--direction', 'right', '--ratio', '0.5', '--no-focus')).pane?.pane_id as string | undefined
  if (viewer === undefined) return undefined
  await herdr(undefined, 'pane', 'rename', viewer, VIEWER_LABEL)
  await herdr(undefined, 'pane', 'run', viewer, command)
  return viewer
}

/** Closes the viewer panes this or an earlier run opened. */
export async function closeViewers() {
  const panes = ((await herdr(undefined, 'pane', 'list')).panes ?? []) as Json[]
  for (const p of panes) if (p.label === VIEWER_LABEL) await herdr(undefined, 'pane', 'close', p.pane_id).catch(() => undefined)
}

class HerdrPane implements Terminal {
  private readonly host: HerdrHost
  readonly paneId: string

  constructor(host: HerdrHost, paneId: string) {
    this.host = host
    this.paneId = paneId
  }

  async screen() {
    return (await this.host.herdrText('pane', 'read', this.paneId, '--source', 'visible')).replace(/\n$/, '')
  }

  async screenAnsi() {
    return (await this.host.herdrText('pane', 'read', this.paneId, '--source', 'visible', '--format', 'ansi')).replace(/\n$/, '')
  }

  async write(bytes: string) {
    await this.host.herdr('pane', 'send-text', this.paneId, bytes)
  }

  async press(...keys: Key[]) {
    await this.host.herdr('pane', 'send-keys', this.paneId, ...keys.map(k => (k === 'escape' ? 'esc' : k)))
  }

  async close() {
    await this.host.release(this.paneId)
  }
}

export class HerdrHost implements Host {
  readonly driver = 'herdr'
  private readonly tmuxSession: string
  private panes: Record<'main' | 'narration' | 'side', string> | undefined
  /** Cells of the main pane, measured once the layout stands. */
  mainSize = { cols: 0, rows: 0 }
  private readonly session: string
  private readonly cwd: string
  private readonly narrationFile: string

  constructor(session: string, cwd: string, narrationFile: string) {
    this.session = session
    this.cwd = cwd
    this.narrationFile = narrationFile
    this.tmuxSession = `${session}-herdr`
  }

  get watchCommand() {
    return `tmux attach -r -t ${this.tmuxSession}`
  }

  async herdrText(...args: string[]): Promise<string> {
    return run('herdr', ['--session', this.session, ...args])
  }

  herdr(...args: string[]): Promise<Json> {
    return herdr(this.session, ...args)
  }

  /** Starts the isolated session and lays out its tab. */
  async start() {
    await this.stop()
    await writeFile(this.narrationFile, '')
    const client = commandLine(['herdr', 'session', 'attach', this.session], {}, INHERITED)
    await newSession(this.tmuxSession, HERDR_SCREEN, this.cwd, client)
    await waitFor('the isolated Herdr server', async () => (await this.herdr('workspace', 'list').catch(() => undefined)) ?? false, { timeoutMs: 20_000 })

    const tab = await this.herdr('tab', 'create', '--label', 'add-to-chat e2e', '--cwd', this.cwd, '--focus')
    const main = tab.root_pane.pane_id as string
    // Close whatever the session opened with, so this tab is the only one.
    for (const t of (await this.herdr('tab', 'list')).tabs as Json[]) {
      if (t.tab_id !== tab.tab.tab_id) await this.herdr('tab', 'close', t.tab_id).catch(() => undefined)
    }
    const narration = (await this.herdr('pane', 'split', main, '--direction', 'right', '--ratio', '0.62', '--cwd', this.cwd, '--no-focus')).pane.pane_id as string
    const side = (await this.herdr('pane', 'split', narration, '--direction', 'down', '--ratio', '0.45', '--cwd', this.cwd, '--no-focus')).pane.pane_id as string
    this.panes = { main, narration, side }
    await this.herdr('pane', 'rename', narration, 'narration')
    await this.waitShell(narration)
    await this.herdr('pane', 'run', narration, `clear; tail -n +1 -F ${shellQuote(this.narrationFile)}`)
    this.mainSize = await this.measure(main)
  }

  private async measure(paneId: string) {
    const layout = (await this.herdr('pane', 'layout', '--pane', paneId)).layout as Json
    const rect = (layout.panes as Json[]).find(p => p.pane_id === paneId)!.rect as Json
    return { cols: rect.width as number, rows: rect.height as number }
  }

  private async isShellIdle(paneId: string): Promise<boolean> {
    const info = (await this.herdr('pane', 'process-info', '--pane', paneId)).process_info as Json
    return info.foreground_process_group_id === info.shell_pid
  }

  private async waitShell(paneId: string) {
    await waitFor(`a shell prompt in ${paneId}`, () => this.isShellIdle(paneId), { timeoutMs: 15_000 })
  }

  private paneFor(slot: Slot): string {
    if (this.panes === undefined) throw new Error('HerdrHost.start() first')
    // The side pane doubles as the small one: it is the smaller of the two.
    return slot === 'main' ? this.panes.main : this.panes.side
  }

  async spawn({ name, cwd, argv, env, slot = 'main' }: SpawnOptions): Promise<Terminal> {
    const paneId = this.paneFor(slot)
    await this.release(paneId)
    await this.herdr('pane', 'run', paneId, `clear; cd ${shellQuote(cwd)} && ${commandLine(argv, env, INHERITED)}`)
    // Name the agent once Herdr recognises Claude Code in the pane, so the
    // sidebar shows which session is which.
    await waitFor(`Claude Code to start in ${paneId}`, async () => {
      const agent = await this.herdr('agent', 'get', paneId).catch(() => undefined)
      return agent?.agent?.agent === 'claude'
    }, { timeoutMs: 30_000 })
    await this.herdr('agent', 'rename', paneId, name).catch(() => undefined)
    await this.herdr('pane', 'rename', paneId, name).catch(() => undefined)
    return new HerdrPane(this, paneId)
  }

  /**
   * Ends what runs in a pane and waits for its shell: Esc gives the keyboard
   * back to the prompt (a mod's pane may hold it), then twice ctrl+c quits.
   */
  async release(paneId: string) {
    for (let attempt = 0; attempt < 4 && !(await this.isShellIdle(paneId)); attempt += 1) {
      await this.herdr('pane', 'send-keys', paneId, 'esc')
      await sleep(150)
      await this.herdr('pane', 'send-keys', paneId, 'ctrl+c')
      await sleep(250)
      await this.herdr('pane', 'send-keys', paneId, 'ctrl+c')
      await waitFor('Claude Code to quit', () => this.isShellIdle(paneId), { timeoutMs: 1_500, intervalMs: 100 }).catch(() => undefined)
    }
    await this.waitShell(paneId)
  }

  async narrate(line: string) {
    await appendFile(this.narrationFile, `${line}\n`)
  }

  async stop() {
    await run('herdr', ['session', 'stop', this.session]).catch(() => undefined)
    await killSession(this.tmuxSession)
    await run('herdr', ['session', 'delete', this.session]).catch(() => undefined)
  }
}
