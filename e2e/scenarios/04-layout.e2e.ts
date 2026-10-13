// The pane in a small terminal: framed above the prompt, not docked.
import { describe } from 'node:test'

import { ADD_LABEL } from '../../add-to-chat/hooks/labels.ts'
import { width } from '../../add-to-chat/hooks/text.ts'
import { waitFor } from '../harness/exec.ts'
import { paneArea } from '../harness/screen.ts'
import { assert, scenario } from '../harness/scenario.ts'

const LAYOUT = 'layout'

describe(LAYOUT, () => {
  scenario(LAYOUT, 'a narrow terminal: the pane sits above the prompt and keeps its height when text is selected', { drivers: ['herdr'] }, async ctx => {
    const claude = await ctx.launchFixture({ slot: 'small', name: 'small' })
    const columns = Math.max(...(await claude.screen()).split('\n').map(width))
    await ctx.step(`the small terminal is about ${columns} columns wide: the pane is framed above the prompt`)
    const area = paneArea(await claude.screen())!
    assert.equal(area.left, 3, 'framed inline, not docked')
    await claude.add('so reading it failed')
    const before = paneArea(await claude.screen())!
    await claude.select('Ran the')
    await waitFor('the offer', () => claude.paneShows('“Ran the”'), { timeoutMs: 5_000 })
    const after = paneArea(await claude.screen())!
    assert.equal(after.bottom - after.top, before.bottom - before.top, 'the offer does not change the pane\'s height')
    assert.ok((await claude.pane()).every(row => width(row) <= columns), 'no pane row is wider than the terminal')
    assert.ok(await claude.paneShows(ADD_LABEL))
    await ctx.evidence('screen with the pane inline', await claude.screen())
  })
})
