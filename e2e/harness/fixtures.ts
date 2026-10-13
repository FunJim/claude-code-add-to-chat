// Sandboxes the sessions run in, and the recorded transcript a session can
// resume so selection scenarios see the same rows on every run.
import { cp, lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PROJECTS_DIR, projectSlug, transcriptPath } from './transcript.ts'

export const E2E_DIR = dirname(dirname(fileURLToPath(import.meta.url)))
export const REPO_DIR = dirname(E2E_DIR)
export const PLUGIN_DIR = join(REPO_DIR, 'add-to-chat')
export const PROBE_DIR = join(E2E_DIR, 'probe')
export const FIXTURES_DIR = join(E2E_DIR, 'fixtures')

/** What the harness names what it starts: tmux and Herdr sessions, the sandbox root. */
export const E2E_PREFIX = 'atc-e2e'

/**
 * Where sandboxes live: fixed per user, so their project folders are known
 * and removable, and inside the user's own temp dir (macOS: /var/folders/…),
 * not the shared /tmp where another user could plant it as a link.
 */
const SANDBOX_ROOT = join(tmpdir(), E2E_PREFIX)

/**
 * The sandbox root, made if missing; refuses one that is a link or another
 * user's, since sandboxes are copied into it and removed recursively.
 */
async function ownRoot(): Promise<string> {
  await mkdir(SANDBOX_ROOT, { recursive: true, mode: 0o700 })
  const stat = await lstat(SANDBOX_ROOT)
  if (stat.isSymbolicLink() || !stat.isDirectory() || stat.uid !== process.getuid?.()) {
    throw new Error(`${SANDBOX_ROOT} is a link or not this user's directory; remove it and run again`)
  }
  return realpath(SANDBOX_ROOT)
}

/** The recorded session's id; installed under each sandbox that resumes it. */
export const FIXTURE_SESSION = 'e2e00000-0000-4000-8000-000000000001'
export const FIXTURE_TRANSCRIPT = join(FIXTURES_DIR, 'transcript.jsonl')

/** Placeholders the recording carries instead of machine-specific values. */
const TOKENS = { cwd: '__ATC_CWD__', slug: '__ATC_SLUG__', home: '__ATC_HOME__' } as const

/**
 * Entries of a recorded session that describe the machine it ran on, not
 * the conversation: the installed skills, agents and MCP servers, the tool
 * list snapshot, and reload notices. No row draws them.
 */
const MACHINE_ATTACHMENTS = ['skill_listing', 'agent_listing_delta', 'mcp_instructions_delta', 'prompt_snapshot']

function isMachineContext(entry: { type?: string; subtype?: string; attachment?: { type?: string } }): boolean {
  if (entry.type === 'system' && entry.subtype === 'informational') return true
  return MACHINE_ATTACHMENTS.includes(entry.attachment?.type ?? '')
}

/**
 * A recorded session made fit to commit: machine context dropped (each
 * child relinked to the dropped entry's parent, so the chain holds) and
 * the session id, paths and home folder replaced by placeholders.
 */
export function forFixture(jsonl: string, { sessionId, cwd }: { sessionId: string; cwd: string }): string {
  const entries = jsonl.split('\n').filter(Boolean).map(line => JSON.parse(line) as Record<string, any>)
  const parentOf = new Map<string, string | null>()
  for (const e of entries) if (isMachineContext(e) && typeof e.uuid === 'string') parentOf.set(e.uuid, e.parentUuid ?? null)
  const kept = entries
    .filter(e => !isMachineContext(e))
    .map(e => {
      let parent = e.parentUuid
      while (typeof parent === 'string' && parentOf.has(parent)) parent = parentOf.get(parent)
      return e.parentUuid === undefined ? e : { ...e, parentUuid: parent }
    })
  return kept
    .map(e => JSON.stringify(e))
    .join('\n')
    .replaceAll(sessionId, FIXTURE_SESSION)
    .replaceAll(projectSlug(cwd), TOKENS.slug)
    .replaceAll(cwd, TOKENS.cwd)
    .replaceAll(homedir(), TOKENS.home)
}

/** A fresh sandbox holding the fixture project; resolves its real path. */
export async function sandbox(name: string): Promise<string> {
  const dir = join(await ownRoot(), name)
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  await cp(join(FIXTURES_DIR, 'project'), dir, { recursive: true })
  return realpath(dir)
}

/** Installs the recorded transcript for `cwd`, so `claude --resume FIXTURE_SESSION` opens it there. */
export async function installTranscript(cwd: string) {
  const recorded = await readFile(FIXTURE_TRANSCRIPT, 'utf8')
  const text = recorded
    .replaceAll(TOKENS.slug, projectSlug(cwd))
    .replaceAll(TOKENS.cwd, cwd)
    .replaceAll(TOKENS.home, homedir())
  const path = transcriptPath(cwd, FIXTURE_SESSION)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, text)
}

/** Removes the sandboxes and the project folders Claude Code made for them. */
export async function removeSandboxes() {
  const exists = await lstat(SANDBOX_ROOT).then(() => true, () => false)
  if (!exists) return
  const root = await ownRoot()
  const prefix = projectSlug(root)
  for (const name of await readdir(PROJECTS_DIR).catch(() => [] as string[])) {
    if (name.startsWith(prefix)) await rm(join(PROJECTS_DIR, name), { recursive: true, force: true })
  }
  await rm(root, { recursive: true, force: true })
}
