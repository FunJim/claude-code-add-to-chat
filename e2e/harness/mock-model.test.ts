import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { FILL_CONTEXT, FULL_CONTEXT_TOKENS, MockModel, chunks, citing, fileText, inputTokens, replyTo } from './mock-model.ts'
import type { MessagesRequest } from './mock-model.ts'

// The shapes Claude Code sends: the prompt, then its context as a system message.
const ENV = { role: 'system', content: [{ type: 'text', text: '# Environment\n - Primary working directory: /work/box\n' }] }
const TOOLS = [{ name: 'Read' }]
const ANNOTATED = [
  '<annotations>',
  '<annotation index="1" source="assistant" requestId="req_1">\n<excerpt>quick brown fox</excerpt>\n<comment>which animal?</comment>\n</annotation>',
  '<annotation index="2" source="assistant" requestId="req_1">\n<excerpt>capital of France</excerpt>\n</annotation>',
  '</annotations>',
  '',
  '<request>\nMODEL-REQ-1: answer them.\n</request>',
].join('\n')

const ask = (text: string, extra: Partial<MessagesRequest> = {}): MessagesRequest => ({ tools: TOOLS, messages: [{ role: 'user', content: text }, ENV], ...extra })

test('a request to read a file: a Read call in the working directory, then its text as written', () => {
  const [call] = replyTo(ask('Read line.txt and reply with exactly its contents and nothing else.'))
  assert.deepEqual(call, { type: 'tool_use', id: (call as { id: string }).id, name: 'Read', input: { file_path: '/work/box/line.txt' } })
  const after = replyTo({
    tools: TOOLS,
    messages: [
      { role: 'user', content: 'Read line.txt' },
      ENV,
      { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name: 'Read' }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '1\tThe fox.\n2\t\n3\tParis.\n4\t' }] },
    ],
  })
  assert.deepEqual(after, [{ type: 'text', text: 'The fox.\n\nParis.' }])
})

test('a bash command in backticks: a Bash call, then "Done."', () => {
  const [call] = replyTo(ask('MODEL-REQ-4A: run the bash command `sleep 10` and then reply SLEPT.'))
  assert.equal((call as { name: string }).name, 'Bash')
  assert.deepEqual((call as { input: unknown }).input, { command: 'sleep 10', description: 'Run the requested command' })
  const after = replyTo({
    tools: TOOLS,
    messages: [
      { role: 'user', content: 'run it' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_2', name: 'Bash' }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_2', content: '' }] },
    ],
  })
  assert.deepEqual(after, [{ type: 'text', text: 'Done.' }])
})

test('Annotations in the turn: one sentence per Annotation, each ending with its Citation', () => {
  const [reply] = replyTo(ask(ANNOTATED))
  assert.equal(reply?.type, 'text')
  const text = (reply as { text: string }).text
  assert.deepEqual([...text.matchAll(/:annotation\{index="(\d+)"\}$/gm)].map(m => m[1]), ['1', '2'])
  assert.ok(!text.includes('fox'), 'no Excerpt repeated on screen')
})

test('Annotations in the context (a template without {{request}}) are cited too', () => {
  const reply = replyTo({ tools: TOOLS, messages: [{ role: 'user', content: 'MODEL-REQ-3: answer my annotation.' }, { role: 'system', content: ANNOTATED }] })
  assert.match((reply[0] as { text: string }).text, /:annotation\{index="1"\}/)
})

test('a prompt queued mid-turn, folded in beside a tool result: its Annotations are cited', () => {
  const reply = replyTo({
    tools: TOOLS,
    messages: [
      { role: 'user', content: 'run it' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_3', name: 'Bash' }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_3', content: '' }, { type: 'text', text: ANNOTATED }] },
    ],
  })
  assert.match((reply[0] as { text: string }).text, /:annotation\{index="2"\}/)
})

test('Annotations of an earlier turn are not cited again', () => {
  const reply = replyTo({ tools: TOOLS, messages: [{ role: 'user', content: ANNOTATED }, { role: 'assistant', content: 'cited' }, { role: 'user', content: 'thanks' }] })
  assert.deepEqual(reply, [{ type: 'text', text: 'OK.' }])
})

test('side calls: a compaction gets a summary, a title a short one, a prompt suggestion nothing', () => {
  const compaction = replyTo({ tools: TOOLS, messages: [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: '' }, { type: 'text', text: 'Your task is to create a detailed summary of the conversation so far.' }] }] })
  assert.match((compaction[0] as { text: string }).text, /<summary>[\s\S]+<\/summary>/)
  assert.deepEqual(replyTo({ messages: [{ role: 'user', content: '<session>\nRead line.txt\n</session>' }] }), [{ type: 'text', text: 'Mock session' }])
  assert.deepEqual(replyTo(ask('[SUGGESTION MODE: Suggest what the user might naturally type next')), [{ type: 'text', text: '' }])
})

test(`input tokens: the request's size; near the window after a ${FILL_CONTEXT} prompt, but not for its compaction or a side call`, () => {
  assert.equal(inputTokens(ask('hi'), 'x'.repeat(400)), 100)
  assert.equal(inputTokens(ask(`MODEL-REQ-7A: ${FILL_CONTEXT} what is annotation 1?`), 'x'), FULL_CONTEXT_TOKENS)
  const compaction = ask(`${FILL_CONTEXT}\nYour task is to create a detailed summary of the conversation so far.`)
  assert.equal(inputTokens(compaction, 'x'.repeat(8)), 2)
  assert.equal(inputTokens({ messages: [{ role: 'user', content: `<session>\n${FILL_CONTEXT}\n</session>` }] }, 'x'.repeat(8)), 2)
})

test('helpers: a Read result made plain, Citations, stream pieces', () => {
  assert.equal(fileText('     1\tone\n     2\ttwo\n<system-reminder>\nnote\n</system-reminder>'), 'one\ntwo')
  assert.equal(citing('no annotations'), undefined)
  assert.deepEqual(chunks('abcdefg', 3), ['abc', 'def', 'g'])
})

test('the server: streams the reply as SSE, counts tokens, logs requests without keys', async () => {
  const log = join(await mkdtemp(join(tmpdir(), 'atc-mock-')), 'requests.jsonl')
  const mock = new MockModel(log)
  const url = await mock.start()
  try {
    const headers = { 'content-type': 'application/json', 'x-api-key': 'secret-key', authorization: 'Bearer secret-token' }
    const res = await fetch(`${url}/v1/messages?beta=true`, { method: 'POST', headers, body: JSON.stringify({ ...ask(ANNOTATED), stream: true }) })
    assert.equal(res.headers.get('content-type'), 'text/event-stream')
    assert.match(res.headers.get('request-id') ?? '', /^req_mock_\d+$/)
    const events = (await res.text()).split('\n\n').filter(Boolean).map(e => JSON.parse(e.split('\ndata: ')[1]!) as { type: string; delta?: { text?: string } })
    assert.equal(events[0]?.type, 'message_start')
    assert.equal(events.at(-1)?.type, 'message_stop')
    const text = events.map(e => e.delta?.text ?? '').join('')
    assert.match(text, /:annotation\{index="1"\}[\s\S]*:annotation\{index="2"\}/)

    const counted = await fetch(`${url}/v1/messages/count_tokens`, { method: 'POST', body: '{}' })
    assert.ok(((await counted.json()) as { input_tokens: number }).input_tokens >= 0)
    assert.equal((await fetch(`${url}/api/hello`)).status, 404)

    const logged = await readFile(log, 'utf8')
    assert.ok(!logged.includes('secret'), 'no key or token in the log')
    assert.match(logged, /MODEL-REQ-1/)
  } finally {
    await mock.stop()
  }
})
