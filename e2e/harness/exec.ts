// Running host commands, and waiting on conditions with a deadline.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** Runs a command and resolves its stdout; rejects with its stderr on a non-zero exit. */
export async function run(cmd: string, args: readonly string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync(cmd, args, { maxBuffer: 64 * 1024 * 1024 })
    return stdout
  } catch (error) {
    const e = error as { stderr?: string; stdout?: string; message: string }
    throw new Error(`${cmd} ${args.join(' ')} failed: ${(e.stderr || e.stdout || e.message).trim()}`)
  }
}

export const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

/**
 * Polls `probe` until it returns something other than undefined/false, or
 * throws naming `what` after `timeoutMs`.
 */
export async function waitFor<T>(
  what: string,
  probe: () => Promise<T | undefined | false> | T | undefined | false,
  { timeoutMs = 15_000, intervalMs = 250 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await probe()
    if (value !== undefined && value !== false) return value
    if (Date.now() > deadline) throw new Error(`timed out after ${timeoutMs}ms waiting for ${what}`)
    await sleep(intervalMs)
  }
}

/**
 * Does `act` and waits up to `timeoutMs` for `done` to hold, up to
 * `attempts` times: a terminal sometimes swallows a click or a drag.
 */
export async function retry<T>(
  what: string,
  act: (attempt: number) => Promise<unknown>,
  done: () => Promise<T | undefined | false>,
  { attempts = 3, timeoutMs = 3_000 }: { attempts?: number; timeoutMs?: number } = {},
): Promise<T> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await act(attempt)
    const value = await waitFor(what, done, { timeoutMs }).catch(() => undefined)
    if (value !== undefined) return value
  }
  throw new Error(`gave up on ${what} after ${attempts} attempts`)
}

/** Quotes one argument for a POSIX shell. */
export function shellQuote(arg: string): string {
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`
}

/** A shell command line that runs `argv` with `env` set and `unset` removed. */
export function commandLine(argv: readonly string[], env: Record<string, string> = {}, unset: readonly string[] = []): string {
  const parts = ['env', ...unset.flatMap(name => ['-u', name]), ...Object.entries(env).map(([k, v]) => `${k}=${v}`), ...argv]
  return parts.map(shellQuote).join(' ')
}
