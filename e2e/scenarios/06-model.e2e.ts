// With the model (haiku): what it is sent, and whether it understands it.
import { copyFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe } from 'node:test'

import { SEND_PLACEHOLDER, clipLine } from '../../add-to-chat/hooks/labels.ts'
import type { ClaudeSession } from '../harness/claude.ts'
import { sleep, waitFor } from '../harness/exec.ts'
import { FIXTURES_DIR } from '../harness/fixtures.ts'
import { assert, scenario } from '../harness/scenario.ts'
import type { Context } from '../harness/scenario.ts'
import { annotationsJson } from '../harness/transcript.ts'

const MODEL = 'model'
// Two short paragraphs, so neither wraps in a transcript the pane narrows.
const LINE = 'The quick brown fox jumps over the lazy dog.\n\nParis is the capital of France.'

/**
 * One cheap reply to select from. The line sits in a file, not in the
 * prompt, so its words show once on screen: in the reply.
 */
async function primed(ctx: Context, options: Parameters<Context['launch']>[0] = { name: 'model' }): Promise<ClaudeSession> {
  const cwd = options.cwd ?? (await ctx.sandbox())
  await writeFile(join(cwd, 'line.txt'), `${LINE}\n`)
  const claude = await ctx.launch({ ...options, cwd })
  await ctx.step('ask for a one-line reply to select from')
  await claude.submit('Read line.txt and reply with exactly its contents and nothing else.')
  await claude.waitShowing('quick brown fox')
  return claude
}

async function exchange(claude: ClaudeSession, marker: string) {
  const transcript = await claude.transcript()
  return waitFor(`the exchange "${marker}" in the transcript`, async () => {
    const x = await transcript.exchange(marker)
    return x !== undefined && x.reply.trim() !== '' ? x : undefined
  }, { timeoutMs: 30_000 })
}

describe(MODEL, () => {
  scenario(MODEL, 'the default template: the model reads the Annotations and cites them; the row shows what was typed', { drivers: ['herdr', 'tmux'], usesModel: true }, async ctx => {
    const claude = await primed(ctx)
    await ctx.step('add two Excerpts of the reply, one with a Comment')
    await claude.add('quick brown fox')
    await claude.comment(1, 'which animal is this?')
    await claude.add('capital of France')
    await ctx.step('send a request that refers to them')
    await claude.submit('MODEL-REQ-1: for each annotation, answer its comment or say what it refers to, in a few words.')

    const x = await exchange(claude, 'MODEL-REQ-1')
    await ctx.evidence('prompt the model read', x.prompt)
    await ctx.evidence('reply as written', x.reply)
    assert.match(x.prompt, /^# Response annotations:/)
    assert.match(x.prompt, /## My request:\nMODEL-REQ-1: for each annotation/)
    const sent = annotationsJson(x.prompt) as { text: string; source: { role: string; requestId?: string }; annotation?: string }[]
    assert.deepEqual(sent.map(a => [a.text, a.source.role, a.annotation]), [
      ['quick brown fox', 'assistant', 'which animal is this?'],
      ['capital of France', 'assistant', undefined],
    ])
    assert.ok(sent.every(a => typeof a.source.requestId === 'string'), 'each carries the row it came from')
    await ctx.step('the model answered with a Citation for each Annotation')
    assert.match(x.reply, /:annotation\{index="1"\}/)
    assert.match(x.reply, /:annotation\{index="2"\}/)

    await ctx.step('the reply shows ① ②, not the directives; the prompt row shows what was typed')
    await claude.waitShowing('①')
    const screen = await claude.screen()
    assert.ok(!screen.includes(':annotation{'), 'no directive shows')
    assert.match(screen, new RegExp(`MODEL-REQ-1: for each annotation[\\s\\S]*${clipLine(2)}`))
    assert.deepEqual(await claude.probe.pending(), [])
    await ctx.evidence('screen', screen)

    await ctx.step('ctrl+o shows the prompt as the model read it')
    await claude.press('ctrl+o')
    await claude.waitShowing('response-annotations')
    await claude.press('ctrl+o')
    await sleep(800)

    await ctx.step('the 📎 line is not offered')
    await claude.select(clipLine(2).slice(0, -1))
    assert.equal(await claude.offers(), false)

    await ctx.step('a resumed session still draws the prompt row compactly')
    const { id } = await claude.probe.session()
    await claude.close()
    const again = await ctx.launch({ name: 'resumed', cwd: claude.cwd, resume: id })
    await again.waitShowing(clipLine(2))
  })

  scenario(MODEL, 'Send with an empty prompt: the Annotations go alone', { drivers: ['herdr'], usesModel: true }, async ctx => {
    const claude = await primed(ctx)
    await claude.add('lazy dog')
    await claude.comment(1, 'rewrite this part with a cat')
    await ctx.step(`[ Send ] fills the prompt with “${SEND_PLACEHOLDER}”; Enter sends it`)
    await claude.clickInPane('[ Send ]', { dx: 3 })
    await waitFor('the filled prompt', async () => (await claude.draft()) === SEND_PLACEHOLDER, { timeoutMs: 5_000 })
    await claude.send()
    const x = await exchange(claude, SEND_PLACEHOLDER)
    assert.match(x.prompt, /## My request:\n\(see annotations\)$/)
    assert.match(x.reply, /:annotation\{index="1"\}/)
    assert.match(x.reply, /cat/i, 'the model acted on the Comment')
    await ctx.evidence('reply as written', x.reply)
  })

  scenario(MODEL, 'a template without {{request}} rides in context (XML style)', { drivers: ['herdr'], usesModel: true }, async ctx => {
    const cwd = await ctx.sandbox()
    await copyFile(join(FIXTURES_DIR, 'templates', 'xml.tmpl'), join(cwd, 'xml.tmpl'))
    const claude = await primed(ctx, { name: 'xml', slot: 'side', cwd, templatePath: join(cwd, 'xml.tmpl') })
    await claude.add('quick brown fox')
    await claude.comment(1, 'name the animal')
    await claude.submit('MODEL-REQ-3: answer my annotation in one short sentence.')
    const x = await exchange(claude, 'MODEL-REQ-3')
    await ctx.evidence('context the model read', x.context.join('\n---\n'))
    assert.equal(x.prompt, 'MODEL-REQ-3: answer my annotation in one short sentence.', 'the prompt goes as typed')
    assert.match(x.context.join('\n'), /<annotation n="1" source="assistant">\n<excerpt>quick brown fox<\/excerpt>\n<comment>name the animal<\/comment>/)
    assert.match(x.reply, /fox/i, 'the model read the Excerpt')
    assert.equal(await claude.isShowing(`${clipLine(1)}\n`), false)
  })

  scenario(MODEL, 'a prompt queued mid-turn carries what was added meanwhile', { drivers: ['herdr'], usesModel: true }, async ctx => {
    const claude = await ctx.launch({ name: 'queue' })
    await ctx.step('start a turn that takes a while')
    await claude.type('MODEL-REQ-4A: run the bash command `sleep 10` and then reply SLEPT.')
    await claude.press('enter')
    await waitFor('the turn to start', () => claude.probe.isWorking(), { timeoutMs: 30_000 })
    await ctx.step('meanwhile add from the prompt row, and queue the next prompt')
    await claude.add('run the bash command')
    await claude.type('MODEL-REQ-4B: quote annotation 1 back to me.')
    await claude.press('enter')
    // A prompt queued mid-turn is folded into that turn: one turn ends both.
    await waitFor('the turn to end', async () => (await claude.probe.turnsCompleted()) >= 1 && !(await claude.probe.isWorking()), { timeoutMs: 240_000, intervalMs: 1_000 })
    const x = await exchange(claude, 'MODEL-REQ-4B')
    const sent = annotationsJson(x.prompt) as { text: string; source: { role: string } }[]
    assert.deepEqual(sent.map(a => [a.text, a.source.role]), [['run the bash command', 'user']])
    assert.match(x.reply, /run the bash command/i)
  })

  scenario(MODEL, '/compact keeps the pending Annotations for the next prompt', { drivers: ['herdr'], usesModel: true, timeoutMs: 420_000 }, async ctx => {
    const claude = await primed(ctx)
    await claude.add('capital of France')
    await ctx.step('/compact')
    const before = await claude.probe.turnsCompleted()
    await claude.command('/compact')
    await waitFor('the compaction', async () => /Compacted/.test(await claude.screen()) || (await claude.probe.turnsCompleted()) > before, { timeoutMs: 240_000, intervalMs: 1_000 })
    await claude.waitIdle()
    assert.equal((await claude.probe.pending()).length, 1)
    await claude.submit('MODEL-REQ-6: what city is my annotation about? One word.')
    const x = await exchange(claude, 'MODEL-REQ-6')
    assert.match(x.prompt, /"text":"capital of France"/)
    assert.match(x.reply, /Paris/i)
  })
})
