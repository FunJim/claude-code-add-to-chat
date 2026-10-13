// The tmux driver: each terminal is a detached tmux session of a fixed size.
import { appendFile } from 'node:fs/promises'

import { commandLine, run, sleep } from './exec.ts'
import { INHERITED } from './terminal.ts'
import type { Host, Key, SpawnOptions, Terminal } from './terminal.ts'

const KEYS: Record<Key, string> = {
  enter: 'Enter',
  escape: 'Escape',
  down: 'Down',
  up: 'Up',
  tab: 'Tab',
  backspace: 'BSpace',
  'ctrl+c': 'C-c',
  'ctrl+o': 'C-o',
  'ctrl+u': 'C-u',
}

const SIZES = { main: { cols: 160, rows: 50 }, side: { cols: 140, rows: 40 }, small: { cols: 80, rows: 24 } }

function tmux(...args: string[]) {
  return run('tmux', args)
}

class TmuxTerminal implements Terminal {
  readonly label: string
  private readonly session: string

  constructor(label: string, session: string) {
    this.label = label
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
    await tmux('kill-session', '-t', this.session).catch(() => undefined)
  }
}

export class TmuxHost implements Host {
  readonly driver = 'tmux'
  readonly mainSize = SIZES.main
  private readonly sessions = new Set<string>()
  private readonly prefix: string
  private readonly narrationFile: string

  constructor(prefix: string, narrationFile: string) {
    this.prefix = prefix
    this.narrationFile = narrationFile
  }

  get watchCommand() {
    return `tmux attach -r -t ${this.prefix}-main`
  }

  async spawn({ name, cwd, argv, env, slot = 'main' }: SpawnOptions): Promise<Terminal> {
    // One session per slot, so `watchCommand` always shows the main one.
    const session = `${this.prefix}-${slot}`
    await tmux('kill-session', '-t', session).catch(() => undefined)
    const { cols, rows } = SIZES[slot]
    await tmux('new-session', '-d', '-s', session, '-x', String(cols), '-y', String(rows), '-c', cwd, commandLine(argv, env, INHERITED))
    // A client of another size must not resize it: the layout stays as measured.
    await tmux('set-option', '-t', session, 'window-size', 'manual')
    await tmux('set-option', '-t', session, 'remain-on-exit', 'off')
    this.sessions.add(session)
    await sleep(300)
    return new TmuxTerminal(name, session)
  }

  async narrate(line: string) {
    await appendFile(this.narrationFile, `${line}\n`)
  }

  async stop() {
    for (const session of this.sessions) await tmux('kill-session', '-t', session).catch(() => undefined)
    this.sessions.clear()
  }
}
