// Running host commands, and waiting on conditions with a deadline.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type RunOptions = { cwd?: string; env?: NodeJS.ProcessEnv; input?: string }

/** Runs a command and resolves its stdout; rejects with its stderr on a non-zero exit. */
export async function run(cmd: string, args: readonly string[], options: RunOptions = {}): Promise<string> {
  try {
    const { stdout } = await execFileAsync(cmd, args, { cwd: options.cwd, env: options.env, maxBuffer: 64 * 1024 * 1024 })
    return stdout
  } catch (error) {
    const e = error as { stderr?: string; stdout?: string; message: string }
    throw new Error(`${cmd} ${args.join(' ')} failed: ${(e.stderr || e.stdout || e.message).trim()}`)
  }
}

export const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

export class Timeout extends Error {}

/**
 * Polls `probe` until it returns something other than undefined/false, or
 * throws a Timeout naming `what` (and the last value seen) after `timeoutMs`.
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
    if (Date.now() > deadline) throw new Timeout(`timed out after ${timeoutMs}ms waiting for ${what}`)
    await sleep(intervalMs)
  }
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
