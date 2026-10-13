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

/** The tmux window the Herdr client draws into: the whole Herdr screen. */
export const HERDR_SCREEN = { cols: 240, rows: 64 }

type Json = Record<string, any>

class HerdrPane implements Terminal {
  private readonly host: HerdrHost
  readonly label: string
  readonly paneId: string

  constructor(host: HerdrHost, label: string, paneId: string) {
    this.host = host
    this.label = label
    this.paneId = paneId
  }

  async screen() {
    return (await this.host.herdrText('pane', 'read', this.paneId, '--source', 'visible')).replace(/\n$/, '')
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

  async herdr(...args: string[]): Promise<Json> {
    const text = (await this.herdrText(...args)).trim()
    // A few commands (rename) answer nothing when they succeed.
    if (text === '') return {}
    const out = JSON.parse(text) as Json
    if (out.error) throw new Error(`herdr ${args.join(' ')}: ${out.error.message}`)
    return out.result as Json
  }

  /** Starts the isolated session and lays out its tab. */
  async start() {
    await this.stop()
    await writeFile(this.narrationFile, '')
    const client = commandLine(['herdr', 'session', 'attach', this.session], {}, INHERITED)
    await run('tmux', ['new-session', '-d', '-s', this.tmuxSession, '-x', String(HERDR_SCREEN.cols), '-y', String(HERDR_SCREEN.rows), '-c', this.cwd, client])
    await run('tmux', ['set-option', '-t', this.tmuxSession, 'window-size', 'manual'])
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

  private async waitShell(paneId: string, timeoutMs = 15_000) {
    await waitFor(`a shell prompt in ${paneId}`, () => this.isShellIdle(paneId), { timeoutMs })
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
    return new HerdrPane(this, name, paneId)
  }

  /** Ends what runs in a pane (twice ctrl+c quits Claude Code) and waits for its shell. */
  async release(paneId: string) {
    if (await this.isShellIdle(paneId)) return
    for (let attempt = 0; attempt < 4 && !(await this.isShellIdle(paneId)); attempt += 1) {
      await this.herdr('pane', 'send-keys', paneId, 'ctrl+c')
      await sleep(250)
      await this.herdr('pane', 'send-keys', paneId, 'ctrl+c')
      await sleep(1500)
    }
    await this.waitShell(paneId)
  }

  async narrate(line: string) {
    await appendFile(this.narrationFile, `${line}\n`)
  }

  async stop() {
    await run('herdr', ['session', 'stop', this.session]).catch(() => undefined)
    await run('tmux', ['kill-session', '-t', this.tmuxSession]).catch(() => undefined)
    await run('herdr', ['session', 'delete', this.session]).catch(() => undefined)
  }
}
