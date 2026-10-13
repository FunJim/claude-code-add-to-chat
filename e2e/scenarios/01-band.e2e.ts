// The band above the prompt: offering the selection, adding it, its
// Comment, the list, removing, and the /add-to-chat command.
import { describe } from 'node:test'

import { sleep, waitFor } from '../harness/exec.ts'
import { assert, scenario } from '../harness/scenario.ts'

const BAND = 'band'

describe(BAND, () => {
  scenario(BAND, 'the band keeps one head row: a hint until text is selected', { drivers: ['herdr', 'tmux'] }, async ctx => {
    const claude = await ctx.launchFixture()
    await claude.waitShowing('select text in the transcript to add it to chat')
    assert.equal((await claude.band()).length, 1)
  })

  scenario(BAND, 'selecting text offers it; ✕ ignore takes the offer away', { drivers: ['herdr', 'tmux'] }, async ctx => {
    const claude = await ctx.launchFixture()
    await ctx.step('select a phrase in the report')
    await claude.scrollTo('Ran the')
    await claude.select('Ran the')
    await claude.waitShowing('✚ Add to chat')
    assert.match((await claude.band()).join('\n'), /“Ran the”/)
    assert.equal((await claude.band()).length, 1, 'the offer takes the head row: the band does not grow')
    await ctx.step('✕ ignore: the offer goes, and the same selection is not offered again')
    await claude.clickInBand('✕ ignore', { dx: 0 })
    await sleep(800)
    assert.equal(await claude.isShowing('✚ Add to chat'), false)
    assert.deepEqual(await claude.probe.pending(), [])
  })

  scenario(BAND, 'Add to chat, a Comment, and the list', { drivers: ['herdr', 'tmux'] }, async ctx => {
    const claude = await ctx.launchFixture()
    await ctx.step('add a table cell from the reply')
    await claude.scrollTo('replied SUB-OK')
    const added = await claude.add('replied SUB-OK the answer is 42')
    assert.deepEqual({ index: added.index, text: added.text, source: added.source }, { index: 1, text: 'replied SUB-OK the answer is 42', source: 'claude' })
    await ctx.step('the Comment field opens for ①; type into it')
    await claude.waitShowing('① Add an optional comment')
    await claude.comment(1, 'why 42?')
    await ctx.step('the list shows ① Claude “…” — why 42?')
    await claude.openList()
    const band = (await claude.band()).join('\n')
    assert.match(band, /📎 1 annotation/)
    assert.match(band, /① Claude\s+“replied SUB-OK the answer is 42” — why 42\?/)
    await ctx.evidence('band', band)
  })

  scenario(BAND, 'a drag that pauses halfway keeps its selection when the band appears', { drivers: ['herdr', 'tmux'] }, async ctx => {
    const claude = await ctx.launchFixture()
    await ctx.step('drag over a phrase near the bottom, holding still halfway for 900ms')
    const selected = await claude.slowSelect('Ran the', 900)
    assert.equal(selected?.text, 'Ran the')
    await claude.waitShowing('“Ran the”', 4_000)
  })

  scenario(BAND, '✕ removes an Annotation and renumbers the rest', { drivers: ['herdr'] }, async ctx => {
    const claude = await ctx.launchFixture()
    await claude.scrollTo('Ran the')
    for (const text of ['Ran the', 'so reading it failed', '混合中文']) await claude.add(text)
    await ctx.step('remove ① from the list')
    await claude.remove(1)
    const list = await claude.probe.pending()
    assert.deepEqual(list.map(a => [a.index, a.text]), [[1, 'so reading it failed'], [2, '混合中文']])
    assert.match((await claude.band()).join('\n'), /📎 2 annotations/)
  })

  scenario(BAND, '/add-to-chat adds the selection, and never the same Excerpt twice', { drivers: ['herdr'] }, async ctx => {
    const claude = await ctx.launchFixture()
    await claude.scrollTo('so reading it failed')
    await claude.select('so reading it failed')
    await ctx.step('run /add-to-chat')
    await claude.command('/add-to-chat')
    assert.equal((await claude.probe.pending()).length, 1)
    assert.match((await claude.toasts()).at(-1) ?? '', /Added ①/)
    await ctx.step('select another phrase, then the first again: no offer, and the command says so')
    await claude.scrollTo('Ran the')
    await claude.select('Ran the')
    await claude.scrollTo('so reading it failed')
    await claude.select('so reading it failed')
    await waitFor('the offer to go', async () => !(await claude.isShowing('✚ Add to chat')), { timeoutMs: 4_000 })
    await claude.command('/add-to-chat')
    assert.match((await claude.toasts()).at(-1) ?? '', /already added/)
    assert.equal((await claude.probe.pending()).length, 1)
  })

  scenario(BAND, 'the Comment field closes when the person goes back to the prompt', { drivers: ['herdr'] }, async ctx => {
    const claude = await ctx.launchFixture()
    await claude.scrollTo('Ran the')
    await claude.add('Ran the')
    await claude.waitShowing('① Add an optional comment')
    await ctx.step('type into the prompt box instead (as after Esc)')
    await claude.type('my own question')
    await claude.waitShowing('sent with your next prompt')
    assert.equal(await claude.isShowing('Add an optional comment'), false)
    assert.equal((await claude.probe.state()).commenting, null)
    assert.equal((await claude.probe.pending())[0]?.comment, undefined)
  })
})
