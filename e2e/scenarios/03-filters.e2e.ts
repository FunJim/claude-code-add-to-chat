// What is not transcript text is never offered: the draft in the prompt
// box, and the pane's own words.
import { describe } from 'node:test'

import { COMMENT_LABEL, IDLE_HINT, SOURCE_HINT } from '../../add-to-chat/hooks/labels.ts'
import { assert, scenario } from '../harness/scenario.ts'

const FILTERS = 'filters'

describe(FILTERS, () => {
  scenario(FILTERS, 'the draft in the prompt box is not offered', { drivers: ['herdr'] }, async ctx => {
    const claude = await ctx.launchFixture()
    await claude.type('DRAFT-WORDS in my own prompt')
    await claude.waitShowing('DRAFT-WORDS')
    await ctx.step('select words of the draft')
    const spot = await claude.findInPrompt('DRAFT-WORDS in my')
    await claude.mouse.drag({ x: spot.x, y: spot.y }, { x: spot.x + spot.width - 1, y: spot.y })
    assert.equal(await claude.offers(), false)
    await claude.press('ctrl+u')
  })

  scenario(FILTERS, "the pane's own words are not offered", { drivers: ['herdr'] }, async ctx => {
    const claude = await ctx.launchFixture()
    await claude.add('so reading it failed')
    await claude.comment(1, 'mine')
    for (const words of [IDLE_HINT.slice(0, 20), SOURCE_HINT.assistant, '“so reading it', `${COMMENT_LABEL}: mine`]) {
      await ctx.step(`select “${words}” in the pane`)
      const spot = await claude.findInPane(words)
      await claude.mouse.drag({ x: spot.x, y: spot.y }, { x: spot.x + spot.width - 1, y: spot.y })
      assert.equal(await claude.offers(), false, `“${words}” was offered`)
      await claude.press('escape')
    }
    assert.equal((await claude.probe.pending()).length, 1)
  })
})
