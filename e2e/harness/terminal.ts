// What a scenario drives: a terminal it can read and type into, hosted by
// tmux or by Herdr. Both drivers implement it; scenarios never know which.

export type Key = 'enter' | 'escape' | 'down' | 'up' | 'tab' | 'backspace' | 'ctrl+c' | 'ctrl+o' | 'ctrl+u'

export interface Terminal {
  /** A short name for logs and reports. */
  readonly label: string
  /** The visible screen, rows joined with newlines. */
  screen(): Promise<string>
  /** Writes bytes as typed (mouse sequences included). */
  write(bytes: string): Promise<void>
  press(...keys: Key[]): Promise<void>
  /** Ends what runs in it; the slot may be reused. */
  close(): Promise<void>
}

/** Where a terminal sits: the main view, a side view, or a deliberately small one. */
export type Slot = 'main' | 'side' | 'small'

export type SpawnOptions = {
  /** Unique among live terminals: [a-z][a-z0-9-]*. */
  name: string
  cwd: string
  argv: readonly string[]
  env: Record<string, string>
  slot?: Slot
}

export interface Host {
  readonly driver: Driver
  spawn(options: SpawnOptions): Promise<Terminal>
  /** Sends a line to the narration the showcase shows. */
  narrate(line: string): Promise<void>
  /** How a person watches it live. */
  readonly watchCommand: string
  /** The cells the main slot's terminal has. */
  readonly mainSize: { cols: number; rows: number }
  stop(): Promise<void>
}

export type Driver = 'herdr' | 'tmux'

/**
 * Variables a parent Claude Code or Herdr session sets that a child must not
 * inherit: they would tie the child to the parent's session or socket.
 */
export const INHERITED = [
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_MESSAGING_SOCKET',
  'CLAUDE_CODE_MESSAGING_TOKEN',
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_SESSION_ATTENDED',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_EXECPATH',
  'HERDR_ENV',
  'HERDR_PANE_ID',
  'HERDR_TAB_ID',
  'HERDR_WORKSPACE_ID',
  'TMUX',
  'TMUX_PANE',
] as const
