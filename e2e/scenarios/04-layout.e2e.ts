// The band in a small terminal: narrow and short.
import { describe } from 'node:test'

import { ADD_LABEL, circled } from '../../add-to-chat/hooks/labels.ts'
import { width } from '../../add-to-chat/hooks/text.ts'
import { waitFor } from '../harness/exec.ts'
import { isBandRow, locate } from '../harness/screen.ts'
import { assert, scenario } from '../harness/scenario.ts'

const LAYOUT = 'layout'

describe(LAYOUT, () => {
  scenario(LAYOUT, 'a narrow, short terminal: the head row stays one row; the Comment number shows', { drivers: ['herdr'] }, async ctx => {
    const claude = await ctx.launchFixture({ slot: 'small', name: 'small' })
    const screen = await claude.screen()
    const columns = Math.max(...screen.split('\n').map(width))
    await ctx.step(`the small pane is about ${columns} columns wide`)
    await waitFor('the band', async () => (await claude.band()).length > 0)
    await claude.add('so reading it failed')
    await waitFor('the Comment field with its number', async () => locate(await claude.screen(), `${circled(1)} `, 1, isBandRow) !== undefined)
    await claude.select('Ran the')
    await claude.waitShowing('“Ran the”')
    const band = await claude.band()
    await ctx.evidence('band', band.join('\n'))
    assert.match(band[0] ?? "", /✚ Add to chat \] “Ran the”.*📎 1/)
    assert.ok(band.every(row => width(row) <= columns), 'no band row is wider than the pane')
    await ctx.step('the list never pushes the head row out')
    await claude.openList()
    assert.ok((await claude.band())[0]?.includes(ADD_LABEL))
  })
})
