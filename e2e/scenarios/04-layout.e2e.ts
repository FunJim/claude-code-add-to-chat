// The band in a small terminal: narrow and short.
import { describe } from 'node:test'

import { waitFor } from '../harness/exec.ts'
import { assert, scenario } from '../harness/scenario.ts'

const LAYOUT = 'layout'

describe(LAYOUT, () => {
  scenario(LAYOUT, 'a narrow, short terminal: the head row stays one row; the Comment number shows', { drivers: ['herdr'] }, async ctx => {
    const claude = await ctx.launchFixture({ slot: 'small', name: 'small' })
    const screen = await claude.screen()
    const width = Math.max(...screen.split('\n').map(r => [...r].length))
    await ctx.step(`the small pane is about ${width} columns wide`)
    await claude.waitShowing('select text')
    await claude.scrollTo('so reading it failed')
    await claude.add('so reading it failed')
    await waitFor('the Comment field with its number', async () => (await claude.band()).some(row => /^▎ ① (Add an optional comment|Optional comment)/.test(row)))
    await claude.scrollTo('Ran the')
    await claude.select('Ran the')
    await claude.waitShowing('“Ran the”')
    const band = await claude.band()
    await ctx.evidence('band', band.join('\n'))
    assert.match(band[0] ?? "", /✚ Add to chat \] “Ran the”.*📎 1/)
    assert.ok(band.every(row => [...row].length <= width), 'no band row is wider than the pane')
    await ctx.step('the list never pushes the head row out')
    await claude.openList()
    assert.match((await claude.band())[0] ?? '', /✚ Add to chat/)
  })
})
