// The tmux driver: each terminal is a detached tmux session of a fixed size.
import { appendFile, writeFile } from 'node:fs/promises'

import { commandLine, run, sleep } from './exec.ts'
import { INHERITED } from './terminal.ts'
import type { Host, Key, Slot, SpawnOptions, Terminal } from './terminal.ts'

const KEYS: Record<Key, string> = { enter: 'Enter', escape: 'Escape', down: 'Down', 'ctrl+o': 'C-o', 'ctrl+u': 'C-u' }

const SIZES: Record<Slot, { cols: number; rows: number }> = { main: { cols: 160, rows: 50 }, side: { cols: 140, rows: 40 }, small: { cols: 80, rows: 24 } }

function tmux(...args: string[]) {
  return run('tmux', args)
}

/**
 * A detached session of `size` running `command`; a client of another size
 * must not resize it, so the layout stays as measured.
 */
export async function newSession(name: string, size: { cols: number; rows: number }, cwd: string, command: string) {
  await killSession(name)
  await tmux('new-session', '-d', '-s', name, '-x', String(size.cols), '-y', String(size.rows), '-c', cwd, command)
  await tmux('set-option', '-t', name, 'window-size', 'manual')
}

export async function killSession(name: string) {
  await tmux('kill-session', '-t', name).catch(() => undefined)
}

class TmuxTerminal implements Terminal {
  private readonly session: string

  constructor(session: string) {
    this.session = session
  }

  screen() {
    return tmux('capture-pane', '-p', '-t', this.session)
  }

  async write(bytes: string) {
    await tmux('send-keys', '-t', this.session, '-l', bytes)
  }

  async press(...keys: Key[]) {
    for (const key of keys) await tmux('send-keys', '-t', this.session, KEYS[key])
  }

  async close() {
    await killSession(this.session)
  }
}

export class TmuxHost implements Host {
  readonly driver = 'tmux'
  readonly mainSize = SIZES.main
  private readonly prefix: string
  private readonly narrationFile: string

  constructor(prefix: string, narrationFile: string) {
    this.prefix = prefix
    this.narrationFile = narrationFile
  }

  get watchCommand() {
    return `tmux attach -r -t ${this.prefix}-main`
  }

  async start() {
    await writeFile(this.narrationFile, '')
  }

  /** One session per slot, so `watchCommand` always shows the main one. */
  private session(slot: Slot) {
    return `${this.prefix}-${slot}`
  }

  async spawn({ cwd, argv, env, slot = 'main' }: SpawnOptions): Promise<Terminal> {
    const session = this.session(slot)
    await newSession(session, SIZES[slot], cwd, commandLine(argv, env, INHERITED))
    await tmux('set-option', '-t', session, 'remain-on-exit', 'off')
    await sleep(300)
    return new TmuxTerminal(session)
  }

  async narrate(line: string) {
    await appendFile(this.narrationFile, `${line}\n`)
  }

  async stop() {
    for (const slot of Object.keys(SIZES) as Slot[]) await killSession(this.session(slot))
  }
}
