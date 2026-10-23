// The line under the prompt while the pane is closed: the offer for the
// selection (✚ Add to chat, its preview, a ✕ that dismisses it), adding
// from there with the pane staying closed, and the count that opens the pane.
import { describe } from 'node:test'

import { ADD_LABEL, CLOSE_TAB, hintLabel } from '../../add-to-chat/hooks/labels.ts'
import { sleep, waitFor } from '../harness/exec.ts'
import { locate, paneArea } from '../harness/screen.ts'
import { assert, scenario } from '../harness/scenario.ts'

const HINT = 'hint offer'

describe(HINT, () => {
  scenario(HINT, 'a session starts with no pane; a selection offers on the line under the prompt, added there with the pane staying closed', { drivers: ['herdr', 'tmux'] }, async ctx => {
    const claude = await ctx.launchFixture({ openPane: false })
    assert.equal(paneArea(await claude.screen()), undefined, 'no pane at the start')
    await ctx.step('select a phrase in the report: the line under the prompt offers it')
    await claude.select('Ran the')
    await waitFor('the offer under the prompt', async () => locate(await claude.screen(), ADD_LABEL) !== undefined, { timeoutMs: 5_000 })
    const screen = await claude.screen()
    assert.ok(screen.includes('“Ran the”'), `the preview shows:\n${screen}`)
    assert.equal(paneArea(screen), undefined, 'the pane stays closed')
    await ctx.evidence('the offer on the line', screen)
    await ctx.step('✚ Add to chat there: the Annotation is made, the pane still closed, the line counts it')
    const add = locate(screen, ADD_LABEL)!
    await claude.mouse.click({ x: add.x + 2, y: add.y })
    await waitFor('the Annotation', async () => (await claude.probe.pending()).length === 1, { timeoutMs: 3_000 })
    await waitFor('the count under the prompt', async () => locate(await claude.screen(), hintLabel(1, false)) !== undefined, { timeoutMs: 5_000 })
    assert.equal(paneArea(await claude.screen()), undefined, 'the pane stays closed')
    await ctx.step('the count opens the pane')
    const count = locate(await claude.screen(), hintLabel(1, false))!
    await claude.mouse.click({ x: count.x + 2, y: count.y })
    await waitFor('the pane', async () => paneArea(await claude.screen()) !== undefined, { timeoutMs: 5_000 })
    assert.ok(await claude.paneShows('Ran the'))
  })

  scenario(HINT, "the offer's ✕ on the line takes it away; the same text, selected again after another, is offered again", { drivers: ['herdr', 'tmux'] }, async ctx => {
    const claude = await ctx.launchFixture({ openPane: false })
    await ctx.step('select a phrase: the line offers it, its ✕ dismisses it')
    await claude.select('Ran the')
    await waitFor('the offer under the prompt', async () => locate(await claude.screen(), ADD_LABEL) !== undefined, { timeoutMs: 5_000 })
    const screen = await claude.screen()
    const offer = screen.split('\n').findIndex(r => r.includes(ADD_LABEL)) + 1
    const row = { top: offer, bottom: offer, left: 0, right: screen.length }
    const x = locate(screen, CLOSE_TAB, 1, row)!
    await claude.mouse.click({ x: x.x, y: x.y })
    await sleep(1_000)
    assert.equal(await claude.isShowing(ADD_LABEL), false, 'the offer is gone from the line')
    assert.deepEqual(await claude.probe.pending(), [])
    await ctx.step('another selection, then the first again: the line offers it')
    await claude.select('running or done')
    await waitFor('the offer under the prompt', async () => locate(await claude.screen(), ADD_LABEL) !== undefined, { timeoutMs: 5_000 })
    await claude.select('Ran the')
    await waitFor('the offer under the prompt', async () => locate(await claude.screen(), ADD_LABEL) !== undefined, { timeoutMs: 5_000 })
    assert.ok((await claude.screen()).includes('“Ran the”'))
  })
})
