#!/usr/bin/env node
// Records e2e/fixtures/transcript.jsonl: one real session holding every kind
// of transcript row the scenarios select from, so they run on the same rows
// every time without calling the model. Re-record after a Claude Code update
// changes how rows are stored:  node e2e/fixtures/record.ts
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ClaudeSession } from '../harness/claude.ts'
import { sleep, waitFor } from '../harness/exec.ts'
import { E2E_DIR, FIXTURE_TRANSCRIPT, forFixture, removeSandboxes, sandbox } from '../harness/fixtures.ts'
import { TmuxHost } from '../harness/tmux.ts'

/**
 * The reply the model copies from the sandbox's REPORT.md: every markdown
 * construct the matcher handles. It sits in a file, not in the prompt, so
 * its text shows once on screen (a Read's output is folded).
 */
const REPORT = `### Report

| Item | Status |
|---|---|
| Subagent | Done: replied SUB-OK the answer is 42 |
| Background command | Done: printed BG-DONE marker |

> missing.txt doesn't exist, so reading it failed.

- Files read
  - app.py
    - Defines \`add(a, b)\` and \`greet(name)\`
- File not found

1. Ran the subagent
2. Read [the notes](https://example.com/notes) and **app.py** too

\`\`\`py
def greet(name):
    print("hi " + name)
\`\`\`

混合中文 and emoji 🚀 with __bold__, _italic_, ~~struck~~ and \`snake_case_name\`.`

const FIRST = [
  'Do all of this, in order:',
  '(1) Use the Agent tool (general-purpose) with the prompt "Reply with exactly: SUB-OK the answer is 42".',
  '(2) Run the Bash command `sleep 4; echo BG-DONE marker` with run_in_background true.',
  '(3) Read the file missing.txt (it does not exist).',
  '(4) Read app.py and NOTES.md.',
  '(5) Once the subagent and the background command have both finished, read REPORT.md and reply with exactly its contents, and nothing else.',
].join('\n')

const MUST_HOLD = ['SUB-OK', 'BG-DONE', 'task-notification', '"text":"### Report', 'BANG-MODE', 'PROBE-OUT', '"text":"PLUGIN-ACK', '混合中文']

/** Waits for a reply row whose text starts with `head`, as the probe saw it drawn. */
async function replyRow(claude: ClaudeSession, head: string, timeoutMs: number) {
  await waitFor(`a reply starting "${head}"`, async () => {
    const rows = await claude.probe.of('row')
    return rows.some(r => r.component === 'AssistantMessage' && (r.text ?? '').trimStart().startsWith(head)) && !(await claude.probe.isWorking())
  }, { timeoutMs, intervalMs: 2_000 })
}

const host = new TmuxHost('atc-record', join(E2E_DIR, 'results', 'record-narration.log'))
const cwd = await sandbox('record')
await writeFile(join(cwd, 'REPORT.md'), `${REPORT}\n`)
const claude = await ClaudeSession.launch(host, join(E2E_DIR, 'results', 'record'), { kind: 'real' }, { name: 'record', cwd })
try {
  console.log('1/4 the rich prompt (subagent, background command, reads, report)…')
  await claude.submit(FIRST, { timeoutMs: 300_000 })
  await replyRow(claude, '### Report', 300_000)
  const transcript = await claude.transcript()
  console.log('2/4 bash mode…')
  await claude.submit('! echo BANG-MODE output', { timeoutMs: 120_000 }).catch(() => undefined)
  console.log('3/4 a command with output…')
  await claude.command('/probe-out')
  console.log('4/4 a plugin prompt…')
  await claude.command('/probe-say')
  await replyRow(claude, 'PLUGIN-ACK', 120_000)
  await sleep(2_000)

  const sessionId = (await claude.probe.session()).id
  const tokenized = forFixture(await readFile(transcript.path, 'utf8'), { sessionId, cwd })
  const missing = MUST_HOLD.filter(m => !tokenized.includes(m))
  if (missing.length > 0) throw new Error(`the recording lacks ${missing.join(', ')}; record again`)
  await writeFile(FIXTURE_TRANSCRIPT, `${tokenized}\n`)
  console.log(`recorded ${tokenized.split('\n').length} rows into ${FIXTURE_TRANSCRIPT}`)
} finally {
  await claude.close()
  await host.stop()
  await removeSandboxes()
}
