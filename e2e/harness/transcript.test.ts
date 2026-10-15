import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { commandLine, shellQuote } from './exec.ts'
import { Transcript, annotationsXml, projectSlug } from './transcript.ts'

const rows = [
  { type: 'user', message: { role: 'user', content: 'first prompt' } },
  { type: 'attachment', attachment: { type: 'hook_additional_context', content: ['<annotation n="1">'] } },
  { type: 'assistant', message: { content: [{ type: 'thinking' }, { type: 'text', text: 'first reply' }] } },
  { type: 'user', isMeta: true, message: { content: 'a reminder' } },
  { type: 'attachment', attachment: { type: 'queued_command', prompt: 'folded prompt' } },
  { type: 'assistant', message: { content: [{ type: 'text', text: 'second reply' }] } },
]

test('exchanges: prompts (folded ones too), their context and replies', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'atc-transcript-'))
  const file = join(dir, 's.jsonl')
  await writeFile(file, rows.map(r => JSON.stringify(r)).join('\n'))
  const t = new Transcript(file)
  assert.deepEqual(await t.exchanges(), [
    { prompt: 'first prompt', context: ['<annotation n="1">'], reply: 'first reply' },
    { prompt: 'folded prompt', context: [], reply: 'second reply' },
  ])
  assert.equal((await t.exchange('<annotation'))?.prompt, 'first prompt')
})

test("an auto-compaction: its summary, written between the prompt and the reply, is no prompt; compactions() says what set each off", async () => {
  const dir = await mkdtemp(join(tmpdir(), 'atc-transcript-'))
  const file = join(dir, 's.jsonl')
  const compacted = [
    { type: 'user', message: { role: 'user', content: 'the prompt' } },
    { type: 'system', subtype: 'compact_boundary', compactMetadata: { trigger: 'auto' } },
    { type: 'user', isCompactSummary: true, message: { role: 'user', content: 'This session is being continued…' } },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'the reply' }] } },
  ]
  await writeFile(file, compacted.map(r => JSON.stringify(r)).join('\n'))
  const t = new Transcript(file)
  assert.deepEqual(await t.exchanges(), [{ prompt: 'the prompt', context: [], reply: 'the reply' }])
  assert.deepEqual(await t.compactions(), ['auto'])
})

test('annotationsXml reads the default template block, unescaped', () => {
  const prompt = '<annotations>\n<annotation index="1" source="assistant" requestId="r1">\n<excerpt>a &lt;b&gt; &amp; c</excerpt>\n<comment>why?</comment>\n</annotation>\n<annotation index="2" source="tool">\n<excerpt>x</excerpt>\n</annotation>\n</annotations>'
  assert.deepEqual(annotationsXml(prompt), [
    { index: 1, source: 'assistant', requestId: 'r1', text: 'a <b> & c', comment: 'why?' },
    { index: 2, source: 'tool', text: 'x' },
  ])
  assert.deepEqual(annotationsXml('no block'), [])
})

test('projectSlug matches Claude Code folder names', () => {
  assert.equal(projectSlug('/private/tmp/atc-e2e/a_b.c'), '-private-tmp-atc-e2e-a-b-c')
})

test('commandLine quotes for the shell and unsets inherited variables', () => {
  assert.equal(shellQuote("it's"), `'it'\\''s'`)
  assert.equal(commandLine(['claude', '--settings', '{"a":1}'], { X: 'y z' }, ['TMUX']), `env -u TMUX 'X=y z' claude --settings '{"a":1}'`)
})
