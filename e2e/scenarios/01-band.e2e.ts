// The band above the prompt: offering the selection, adding it, its
// Comment, the list, removing, and the /add-to-chat command.
import { describe } from 'node:test'

import { ADD_LABEL, ALREADY_ADDED, COMMENT_PLACEHOLDER, IDLE_HINT, IGNORE_LABEL, SENT_HINT, addedToast, clipLine } from '../../add-to-chat/hooks/labels.ts'
import { waitFor } from '../harness/exec.ts'
import { assert, scenario } from '../harness/scenario.ts'

const BAND = 'band'

describe(BAND, () => {
  scenario(BAND, 'the band keeps one head row: a hint until text is selected', { drivers: ['herdr', 'tmux'] }, async ctx => {
    const claude = await ctx.launchFixture()
    await claude.waitShowing(IDLE_HINT)
    assert.equal((await claude.band()).length, 1)
  })

  scenario(BAND, 'selecting text offers it; ✕ ignore takes the offer away', { drivers: ['herdr', 'tmux'] }, async ctx => {
    const claude = await ctx.launchFixture()
    await ctx.step('select a phrase in the report')
    await claude.select('Ran the')
    await claude.waitShowing(ADD_LABEL)
    assert.match((await claude.band()).join('\n'), /“Ran the”/)
    assert.equal((await claude.band()).length, 1, 'the offer takes the head row: the band does not grow')
    await ctx.step('✕ ignore: the offer goes, and the same selection is not offered again')
    await claude.clickInBand(IGNORE_LABEL, { dx: 0 })
    assert.equal(await claude.offers(), false)
    assert.deepEqual(await claude.probe.pending(), [])
  })

  scenario(BAND, 'Add to chat, a Comment, and the list', { drivers: ['herdr', 'tmux'] }, async ctx => {
    const claude = await ctx.launchFixture()
    await ctx.step('add a table cell from the reply')
    const added = await claude.add('replied SUB-OK the answer is 42')
    assert.deepEqual({ index: added.index, text: added.text, source: added.source }, { index: 1, text: 'replied SUB-OK the answer is 42', source: 'claude' })
    await ctx.step('the Comment field opens for ①; type into it')
    await claude.waitShowing(`① ${COMMENT_PLACEHOLDER}`)
    await claude.comment(1, 'why 42?')
    await ctx.step('the list shows ① Claude “…” — why 42?')
    await claude.openList()
    const band = (await claude.band()).join('\n')
    assert.ok(band.includes(clipLine(1)))
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
    for (const text of ['Ran the', 'so reading it failed', '混合中文']) await claude.add(text)
    await ctx.step('remove ① from the list')
    await claude.remove(1)
    const list = await claude.probe.pending()
    assert.deepEqual(list.map(a => [a.index, a.text]), [[1, 'so reading it failed'], [2, '混合中文']])
    assert.ok(await claude.bandShows(clipLine(2)))
  })

  scenario(BAND, '/add-to-chat adds the selection, and never the same Excerpt twice', { drivers: ['herdr'] }, async ctx => {
    const claude = await ctx.launchFixture()
    await claude.select('so reading it failed')
    await ctx.step('run /add-to-chat')
    await claude.command('/add-to-chat')
    assert.equal((await claude.probe.pending()).length, 1)
    assert.equal((await claude.toasts()).at(-1), addedToast(1))
    await ctx.step('select another phrase, then the first again: no offer, and the command says so')
    await claude.select('Ran the')
    await claude.select('so reading it failed')
    await waitFor('the offer to go', async () => !(await claude.bandShows(ADD_LABEL)), { timeoutMs: 4_000 })
    await claude.command('/add-to-chat')
    assert.equal((await claude.toasts()).at(-1), ALREADY_ADDED)
    assert.equal((await claude.probe.pending()).length, 1)
  })

  scenario(BAND, 'the Comment field closes when the person goes back to the prompt', { drivers: ['herdr'] }, async ctx => {
    const claude = await ctx.launchFixture()
    await claude.add('Ran the')
    await claude.waitShowing(`① ${COMMENT_PLACEHOLDER}`)
    await ctx.step('type into the prompt box instead (as after Esc)')
    await claude.type('my own question')
    await claude.waitShowing(SENT_HINT)
    assert.equal(await claude.isShowing(COMMENT_PLACEHOLDER), false)
    await waitFor('the Comment field to close', async () => (await claude.probe.state()).commenting === null, { timeoutMs: 3_000 })
    assert.equal((await claude.probe.pending())[0]?.comment, undefined)
  })
})
