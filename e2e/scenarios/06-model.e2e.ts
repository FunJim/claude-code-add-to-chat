// With the model: what it is sent, and what the mod makes of the reply. With
// `--model haiku`, also whether the model understands the template; the mock
// model cites every Annotation it is sent, and knows nothing else.
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe } from 'node:test'

import { SEND_PLACEHOLDER, clipButtonLabel, clipLine, historyLabel } from '../../add-to-chat/hooks/labels.ts'
import type { ClaudeSession } from '../harness/claude.ts'
import { sleep, waitFor } from '../harness/exec.ts'
import { AUTO_COMPACT_WINDOW, FILL_CONTEXT } from '../harness/mock-model.ts'
import { assert, scenario } from '../harness/scenario.ts'
import type { Context } from '../harness/scenario.ts'
import { textIn, transcriptArea } from '../harness/screen.ts'
import { annotationsXml } from '../harness/transcript.ts'

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

/**
 * After a compaction, a prompt sent before it with `excerpt` still has its
 * 📎 row under it and its place in the history (of `sent` such prompts),
 * and ↑ to it brings its Annotation back; Esc Esc takes it out again.
 */
async function keptAcrossCompaction(ctx: Context, claude: ClaudeSession, prompt: string, excerpt: string, sent: number) {
  await ctx.step('the prompt sent before the compaction keeps its 📎 row and its place in the history')
  const screen = await claude.screen()
  const rows = textIn(screen, transcriptArea(screen))
  const at = rows.findIndex(r => r.startsWith(`❯ ${prompt}`))
  assert.ok(at >= 0, 'the prompt row, as typed')
  assert.equal(rows[at + 1]?.trim(), clipButtonLabel(1), 'its 📎 row right under it')
  await waitFor('the history', () => claude.paneShows(historyLabel(sent)), { timeoutMs: 5_000 })
  await ctx.evidence('screen after the compaction', screen)

  await ctx.step('↑ to it: what was typed, its Annotation pending again; Esc Esc takes it out')
  for (let presses = 0; (await claude.draft()) !== prompt; presses += 1) {
    assert.ok(presses < 6, `"${prompt}" within 6 presses of ↑`)
    await claude.press('up')
    await sleep(400)
  }
  await waitFor('the Annotation back', async () => (await claude.probe.pending()).map(a => a.text).join() === excerpt, { timeoutMs: 3_000 })
  await claude.press('escape')
  await sleep(150)
  await claude.press('escape')
  await waitFor('the Annotation gone', async () => (await claude.probe.pending()).length === 0, { timeoutMs: 4_000 })
}

describe(MODEL, () => {
  scenario(MODEL, 'the template: the model reads the Annotations and cites them; the row shows what was typed', { drivers: ['herdr', 'tmux'], usesModel: true }, async ctx => {
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
    assert.match(x.prompt, /^<annotations>\n/)
    assert.match(x.prompt, /<request>\nMODEL-REQ-1: for each annotation[^\n]*\n<\/request>$/)
    const sent = annotationsXml(x.prompt)
    assert.deepEqual(sent.map(a => [a.index, a.text, a.source, a.comment]), [
      [1, 'quick brown fox', 'assistant', 'which animal is this?'],
      [2, 'capital of France', 'assistant', undefined],
    ])
    assert.ok(sent.every(a => typeof a.requestId === 'string'), 'each carries the row it came from')
    await ctx.step('the model answered with a Citation for each Annotation')
    assert.match(x.reply, /:annotation\{index="1"\}/)
    assert.match(x.reply, /:annotation\{index="2"\}/)

    await ctx.step('the reply rows are kept with the prompt they answer, bounded by its two Annotations')
    await waitFor('the reply rows kept', async () => Object.values((await claude.probe.state()).replyCounts).includes(2), { timeoutMs: 5_000 })

    await ctx.step('the reply shows ① ②, not the directives; the prompt row shows what was typed')
    await claude.waitShowing('①')
    const screen = await claude.screen()
    assert.ok(!screen.includes(':annotation{'), 'no directive shows')
    assert.match(screen, new RegExp(`MODEL-REQ-1: for each annotation[\\s\\S]*${clipLine(2)}`))
    assert.deepEqual(await claude.probe.pending(), [])
    await ctx.evidence('screen', screen)

    await ctx.step('ctrl+o shows the prompt as the model read it')
    await claude.press('ctrl+o')
    await claude.waitShowing('</annotations>')
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

  scenario(MODEL, 'Send with an empty prompt: the Annotations go alone, a Comment typed and not saved with them', { drivers: ['herdr', 'tmux'], usesModel: true }, async ctx => {
    const claude = await primed(ctx)
    await claude.add('lazy dog')
    await claude.typeComment(1, 'rewrite this part with a cat')
    await ctx.step(`[ Send ] fills the prompt with “${SEND_PLACEHOLDER}”; Enter sends it`)
    await claude.clickInPane('[ Send ]', { dx: 3 })
    await waitFor('the filled prompt', async () => (await claude.draft()) === SEND_PLACEHOLDER, { timeoutMs: 5_000 })
    await claude.send()
    const x = await exchange(claude, SEND_PLACEHOLDER)
    assert.match(x.prompt, /<request>\n\(see annotations\)\n<\/request>$/)
    assert.deepEqual(annotationsXml(x.prompt).map(a => a.comment), ['rewrite this part with a cat'], 'the Comment never saved went too')
    assert.match(x.reply, /:annotation\{index="1"\}/)
    if (ctx.isRealModel) assert.match(x.reply, /cat/i, 'the model acted on the Comment')
    await ctx.evidence('reply as written', x.reply)
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
    assert.deepEqual(annotationsXml(x.prompt).map(a => [a.text, a.source]), [['run the bash command', 'user']])
    if (ctx.isRealModel) assert.match(x.reply, /run the bash command/i)
    else assert.match(x.reply, /:annotation\{index="1"\}/)
  })

  scenario(MODEL, '/compact: the pending Annotations go with the next prompt; one sent before keeps its 📎 row and its Annotations', { drivers: ['herdr'], usesModel: true, timeoutMs: 420_000 }, async ctx => {
    const claude = await primed(ctx)
    await claude.add('quick brown fox')
    const EARLIER = 'MODEL-REQ-6A: what is annotation 1?'
    await claude.submit(EARLIER)
    await exchange(claude, 'MODEL-REQ-6A')
    await claude.waitIdle()
    await claude.add('capital of France')
    await ctx.step('/compact')
    await claude.command('/compact')
    // The screen can say "Compacted" before the transcript holds the boundary.
    const transcript = await claude.transcript()
    await waitFor('the compaction in the transcript', async () => (await transcript.compactions()).length > 0, { timeoutMs: 240_000, intervalMs: 1_000 })
    await claude.waitIdle()
    assert.deepEqual(await transcript.compactions(), ['manual'])
    assert.equal((await claude.probe.pending()).length, 1)
    await claude.submit('MODEL-REQ-6: what city is my annotation about? One word.')
    const x = await exchange(claude, 'MODEL-REQ-6')
    assert.deepEqual(annotationsXml(x.prompt).map(a => a.text), ['capital of France'])
    if (ctx.isRealModel) assert.match(x.reply, /Paris/i)
    else assert.match(x.reply, /:annotation\{index="1"\}/)
    await claude.waitIdle()
    await keptAcrossCompaction(ctx, claude, EARLIER, 'quick brown fox', 2)
  })

  // Only the mock can fill the context cheaply: it reports a reply's input tokens near the window.
  scenario(MODEL, 'an auto-compaction: the prompt that sets it off goes with its Annotations; one sent before keeps its 📎 row and its Annotations', { drivers: ['herdr'], usesModel: true, models: ['mock'], timeoutMs: 420_000 }, async ctx => {
    // Short enough not to wrap: the 📎 row is looked for right under it.
    const FILLING = `MODEL-REQ-7A: ${FILL_CONTEXT} what is annotation 1?`
    const claude = await primed(ctx, { name: 'auto-compact', env: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: String(AUTO_COMPACT_WINDOW) } })
    await claude.add('quick brown fox')
    await ctx.step('a reply that leaves the context nearly full')
    await claude.submit(FILLING)
    await exchange(claude, 'MODEL-REQ-7A')
    await claude.waitIdle()
    await ctx.step('the next prompt, with an Annotation: Claude Code compacts, then sends it with the Annotation')
    await claude.add('capital of France')
    await claude.submit('MODEL-REQ-7: what city is my annotation about? One word.')
    const x = await exchange(claude, 'MODEL-REQ-7:')
    const transcript = await claude.transcript()
    await waitFor('the compaction in the transcript', async () => (await transcript.compactions()).length > 0, { timeoutMs: 10_000 })
    assert.deepEqual(await transcript.compactions(), ['auto'])
    assert.deepEqual(annotationsXml(x.prompt).map(a => a.text), ['capital of France'])
    assert.match(x.reply, /:annotation\{index="1"\}/)
    assert.deepEqual(await claude.probe.pending(), [])
    await claude.waitIdle()
    await ctx.step('the reply, past the summary, is kept with the prompt: it shows ①, not the directive')
    await waitFor('the reply row kept', async () => Object.values((await claude.probe.state()).replyCounts).length === 2, { timeoutMs: 5_000 })
    await sleep(800)
    assert.equal(await claude.isShowing(':annotation{'), false, 'no directive shows')
    await keptAcrossCompaction(ctx, claude, FILLING, 'quick brown fox', 2)
  })
})
