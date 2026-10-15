// The pane beside the transcript: offering the selection, adding it, a tab
// per Annotation with its Comment, closing tabs, /add-to-chat, closing the
// pane itself, and the count under the prompt that shows or hides it.
import { describe } from 'node:test'

import { ADD_LABEL, ALREADY_ADDED, CLOSE_TAB, COMMENT_LABEL, IDLE_HINT, PANE_EMPTY, SAVE_LABEL, addedNote, addedToast, hintLabel } from '../../add-to-chat/hooks/labels.ts'
import { framed } from '../harness/claude.ts'
import { sleep, waitFor } from '../harness/exec.ts'
import { locate, paneArea } from '../harness/screen.ts'
import { assert, scenario } from '../harness/scenario.ts'

const PANE = 'pane'

describe(PANE, () => {
  scenario(PANE, 'the pane is open from the start: a hint until text is selected', { drivers: ['herdr', 'tmux'] }, async ctx => {
    const claude = await ctx.launchFixture()
    await waitFor('the hint', () => claude.paneShows(IDLE_HINT), { timeoutMs: 5_000 })
    assert.ok(await claude.paneShows(PANE_EMPTY))
    await ctx.evidence('screen', await claude.screen())
  })

  scenario(PANE, "selecting text offers it in the first row; its ✕ takes the offer away, and /add-to-chat adds it after all", { drivers: ['herdr', 'tmux'] }, async ctx => {
    const claude = await ctx.launchFixture()
    const before = await claude.pane()
    await ctx.step('select a phrase in the report')
    await claude.select('Ran the')
    await waitFor('the offer', () => claude.paneShows(ADD_LABEL), { timeoutMs: 5_000 })
    const after = await claude.pane()
    assert.ok(await claude.paneShows('“Ran the”'))
    assert.equal(after.findIndex(r => r.includes(ADD_LABEL)), before.findIndex(r => r.includes(IDLE_HINT)), 'the offer takes the hint\'s row')
    assert.equal(after.length, before.length, 'the pane keeps its size')
    await ctx.step(`${CLOSE_TAB}: the offer goes, the hint is back, and the same selection is not offered again`)
    await claude.dismissOffer()
    assert.equal(await claude.offers(), false)
    assert.deepEqual(await claude.probe.pending(), [])
    assert.ok(await claude.paneShows(IDLE_HINT))
    await ctx.step('/add-to-chat adds it after all')
    await claude.command('/add-to-chat')
    await waitFor('the Annotation', async () => (await claude.probe.pending()).length === 1, { timeoutMs: 3_000 })
    assert.equal((await claude.toasts()).at(-1), addedToast(1))
  })

  scenario(PANE, 'Add to chat makes a tab; its whole Excerpt and its Comment show there', { drivers: ['herdr', 'tmux'] }, async ctx => {
    const claude = await ctx.launchFixture()
    await ctx.step('add a table cell from the reply, and comment on it')
    const added = await claude.add('replied SUB-OK the answer is 42')
    assert.deepEqual({ index: added.index, text: added.text, source: added.source }, { index: 1, text: 'replied SUB-OK the answer is 42', source: 'assistant' })
    await claude.comment(1, 'why 42?')
    await ctx.step('add a second one from a prompt row: its tab opens')
    await claude.add('Read the file missing.txt')
    for (const words of ['1: Claude', '2: You', '② from your prompt', framed('Read the file missing.txt')]) {
      assert.ok(await claude.paneShows(words), `the pane shows ${words}`)
    }
    await ctx.step('tab ① shows its whole Excerpt and its Comment')
    await claude.showTab(1)
    assert.ok(await claude.paneShows(framed('replied SUB-OK the answer is 42')))
    assert.ok(await claude.paneShows('Comment: why 42?'))
    await ctx.evidence('screen with two tabs', await claude.screen())
  })

  scenario(PANE, 'a drag that pauses halfway keeps its selection when the offer appears', { drivers: ['herdr', 'tmux'] }, async ctx => {
    const claude = await ctx.launchFixture()
    await ctx.step('drag over a phrase near the bottom, holding still halfway for 900ms')
    const selected = await claude.slowSelect('Ran the', 900)
    assert.equal(selected?.text, 'Ran the')
    await waitFor('the offer', () => claude.paneShows('“Ran the”'), { timeoutMs: 4_000 })
  })

  scenario(PANE, 'closing a tab removes its Annotation and renumbers the rest', { drivers: ['herdr'] }, async ctx => {
    const claude = await ctx.launchFixture()
    for (const text of ['Ran the', 'so reading it failed', '混合中文']) await claude.add(text)
    await ctx.step(`close tab ① with its ${CLOSE_TAB}`)
    await claude.remove(1)
    const list = await claude.probe.pending()
    assert.deepEqual(list.map(a => [a.index, a.text]), [[1, 'so reading it failed'], [2, '混合中文']])
    assert.ok(await claude.paneShows('2: Claude'))
    assert.equal(await claude.paneShows('3: '), false)
  })

  scenario(PANE, 'an Annotation removed can be added again from the same selection', { drivers: ['herdr', 'tmux'] }, async ctx => {
    const claude = await ctx.launchFixture()
    await claude.add('so reading it failed')
    await waitFor('the first row to say it is added', () => claude.paneShows(`“so reading it failed” ${addedNote(1)}`), { timeoutMs: 3_000 })
    await ctx.step(`close its tab: the selection it came from is offered again`)
    await claude.remove(1)
    await waitFor('the offer', () => claude.paneShows(ADD_LABEL), { timeoutMs: 5_000 })
    await ctx.step('select the same text and add it: a tab again')
    const again = await claude.add('so reading it failed')
    assert.equal(again.text, 'so reading it failed')
    assert.equal((await claude.probe.pending()).length, 1)
  })

  scenario(PANE, '/add-to-chat adds the selection, and never the same Excerpt twice', { drivers: ['herdr'] }, async ctx => {
    const claude = await ctx.launchFixture()
    await claude.select('so reading it failed')
    await ctx.step('run /add-to-chat')
    await claude.command('/add-to-chat')
    // The probe records the state every 200ms: wait for it, on a slow machine too.
    await waitFor('the Annotation', async () => (await claude.probe.pending()).length === 1, { timeoutMs: 3_000 })
    assert.equal((await claude.toasts()).at(-1), addedToast(1))
    await ctx.step('select another phrase, then the first again: no offer, and the command says so')
    await claude.select('Ran the')
    await claude.select('so reading it failed')
    await waitFor('the offer to go', async () => !(await claude.paneShows(ADD_LABEL)), { timeoutMs: 4_000 })
    await claude.command('/add-to-chat')
    await waitFor('the toast', async () => (await claude.toasts()).at(-1) === ALREADY_ADDED, { timeoutMs: 3_000 })
    assert.equal((await claude.probe.pending()).length, 1)
  })

  scenario(PANE, 'Enter saves a Comment and the field keeps it, Enter again too; one typed and not saved is kept when its tab is left', { drivers: ['herdr', 'tmux'] }, async ctx => {
    const claude = await ctx.launchFixture()
    await claude.add('so reading it failed')
    await ctx.step('type a Comment and press Enter, then Enter again: it stays, and the field keeps the keyboard')
    await claude.comment(1, 'why did it fail?')
    await claude.press('enter')
    await sleep(800)
    assert.ok(await claude.paneShows(`${COMMENT_LABEL}: why did it fail?`), 'the field still holds the Comment')
    assert.ok(await claude.paneShows(`⏎ ${SAVE_LABEL}`), 'and still has the keyboard')
    assert.equal((await claude.probe.pending())[0]?.comment, 'why did it fail?')
    await ctx.step("add another, type its Comment without Enter, go back to the first tab: the typed one is kept")
    await claude.add('Ran the')
    await claude.typeComment(2, 'typed, not saved')
    await claude.showTab(1)
    await waitFor('the typed Comment kept', async () => (await claude.probe.pending())[1]?.comment === 'typed, not saved', { timeoutMs: 3_000 })
    await ctx.evidence('screen', await claude.screen())
  })

  scenario(PANE, 'with Annotations pending, the count under the prompt hides the pane and shows it again', { drivers: ['herdr', 'tmux'] }, async ctx => {
    const claude = await ctx.launchFixture()
    await claude.add('Ran the')
    const at = (label: string) => waitFor(`“${label}” under the prompt`, async () => locate(await claude.screen(), label), { timeoutMs: 5_000 })
    await ctx.step(`“${hintLabel(1, true)}” shows under the prompt; click it`)
    const hide = await at(hintLabel(1, true))
    await ctx.evidence('screen with the count', await claude.screen())
    await claude.mouse.click({ x: hide.x + 2, y: hide.y })
    await waitFor('the pane to close', async () => paneArea(await claude.screen()) === undefined, { timeoutMs: 5_000 })
    await ctx.step(`it reads “${hintLabel(1, false)}”: click it, the pane shows the Annotation again`)
    await claude.waitStill()
    const show = await at(hintLabel(1, false))
    await claude.mouse.click({ x: show.x + 2, y: show.y })
    await waitFor('the pane', async () => paneArea(await claude.screen()) !== undefined, { timeoutMs: 5_000 })
    assert.ok(await claude.paneShows(framed('Ran the')))
    await at(hintLabel(1, true))
  })

  scenario(PANE, 'a pane the person closes stays closed until /add-to-chat', { drivers: ['herdr'] }, async ctx => {
    const claude = await ctx.launchFixture()
    await claude.add('Ran the')
    await ctx.step(`close the pane with the ${CLOSE_TAB} on its frame`)
    await claude.clickInPane(CLOSE_TAB, { dx: 0 })
    await waitFor('the pane to close', async () => paneArea(await claude.screen()) === undefined, { timeoutMs: 5_000 })
    await claude.waitStill()
    await claude.select('so reading it failed')
    assert.equal(paneArea(await claude.screen()), undefined, 'a selection does not bring it back')
    await ctx.step('/add-to-chat opens it again and adds the selection')
    await claude.command('/add-to-chat')
    await waitFor('the pane', async () => paneArea(await claude.screen()) !== undefined, { timeoutMs: 5_000 })
    await waitFor('the second Annotation', async () => (await claude.probe.pending()).length === 2, { timeoutMs: 3_000 })
    assert.deepEqual((await claude.probe.pending()).map(a => a.text), ['Ran the', 'so reading it failed'])
  })
})
