// Sandboxes the sessions run in, and the recorded transcript a session can
// resume so selection scenarios see the same rows on every run.
import { cp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { projectSlug } from './transcript.ts'

export const E2E_DIR = dirname(dirname(fileURLToPath(import.meta.url)))
export const REPO_DIR = dirname(E2E_DIR)
export const PLUGIN_DIR = join(REPO_DIR, 'add-to-chat')
export const PROBE_DIR = join(E2E_DIR, 'probe')
export const FIXTURES_DIR = join(E2E_DIR, 'fixtures')

/** Where sandboxes live: fixed, so their project folders are known and removable. */
export const SANDBOX_ROOT = '/tmp/atc-e2e'

/** The recorded session's id; installed under each sandbox that resumes it. */
export const FIXTURE_SESSION = 'e2e00000-0000-4000-8000-000000000001'
export const FIXTURE_TRANSCRIPT = join(FIXTURES_DIR, 'transcript.jsonl')

/** Placeholders the recording carries instead of machine-specific values. */
export const TOKENS = { cwd: '__ATC_CWD__', slug: '__ATC_SLUG__', home: '__ATC_HOME__' } as const

/** A fresh sandbox holding the fixture project; resolves its real path. */
export async function sandbox(name: string): Promise<string> {
  const dir = join(SANDBOX_ROOT, name)
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  await cp(join(FIXTURES_DIR, 'project'), dir, { recursive: true })
  return realpath(dir)
}

/** Installs the recorded transcript for `cwd`, so `claude --resume FIXTURE_SESSION` opens it there. */
export async function installTranscript(cwd: string): Promise<string> {
  const recorded = await readFile(FIXTURE_TRANSCRIPT, 'utf8')
  const text = recorded
    .replaceAll(TOKENS.slug, projectSlug(cwd))
    .replaceAll(TOKENS.cwd, cwd)
    .replaceAll(TOKENS.home, homedir())
  const dir = join(homedir(), '.claude', 'projects', projectSlug(cwd))
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, `${FIXTURE_SESSION}.jsonl`), text)
  return FIXTURE_SESSION
}

/** Removes the sandboxes and the project folders Claude Code made for them. */
export async function removeSandboxes() {
  const root = await realpath(SANDBOX_ROOT).catch(() => undefined)
  if (root === undefined) return
  const prefix = projectSlug(root)
  const projects = join(homedir(), '.claude', 'projects')
  for (const name of await readdir(projects).catch(() => [] as string[])) {
    if (name.startsWith(prefix)) await rm(join(projects, name), { recursive: true, force: true })
  }
  await rm(root, { recursive: true, force: true })
}
