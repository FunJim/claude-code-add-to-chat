// What is not transcript text is never offered: the draft in the prompt
// box, and the band's own words.
import { describe } from 'node:test'

import { sleep } from '../harness/exec.ts'
import { assert, scenario } from '../harness/scenario.ts'

const FILTERS = 'filters'

describe(FILTERS, () => {
  scenario(FILTERS, 'the draft in the prompt box is not offered', { drivers: ['herdr'] }, async ctx => {
    const claude = await ctx.launchFixture()
    await claude.type('DRAFT-WORDS in my own prompt')
    await claude.waitShowing('DRAFT-WORDS')
    await ctx.step('select words of the draft')
    await claude.select('DRAFT-WORDS in my')
    await sleep(1_000)
    assert.equal(await claude.bandShows('✚ Add to chat'), false)
    await claude.press('ctrl+u')
  })

  scenario(FILTERS, "the band's own words are not offered", { drivers: ['herdr'] }, async ctx => {
    const claude = await ctx.launchFixture()
    await claude.scrollTo('so reading it failed')
    await claude.add('so reading it failed')
    for (const words of ['Add an optional comment', 'annotation ▸', 'nothing to add?']) {
      await ctx.step(`select “${words}” in the band`)
      const spot = await claude.findInBand(words)
      await claude.mouse.drag({ x: spot.x, y: spot.y }, { x: spot.x + spot.width - 1, y: spot.y })
      await sleep(1_200)
      assert.equal(await claude.bandShows('✚ Add to chat'), false, `“${words}” was offered`)
      await claude.press('escape')
    }
    assert.equal((await claude.probe.pending()).length, 1)
  })
})
