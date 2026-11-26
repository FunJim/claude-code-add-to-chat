// What is not transcript text is never offered: the draft in the prompt
// box, and the pane's own words.
import { describe } from 'node:test'

import { ADD_LABEL, COMMENT_LABEL, SOURCE_HINT, addedNote } from '../../add-to-chat/hooks/labels.ts'
import { sleep } from '../harness/exec.ts'
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

  scenario(FILTERS, 'a drag from the prompt box down onto the line under it is not offered', { drivers: ['herdr', 'tmux'] }, async ctx => {
    const claude = await ctx.launchFixture({ openPane: false })
    await claude.type('DRAFT-WORDS in my own prompt')
    await claude.waitShowing('DRAFT-WORDS')
    await ctx.step('drag from the draft down over the box\'s rule onto the hint line')
    const spot = await claude.findInPrompt('DRAFT-WORDS in my')
    await claude.mouse.drag({ x: spot.x + 2, y: spot.y }, { x: spot.x + 10, y: spot.y + 3 })
    await sleep(1_000)
    assert.notEqual(await claude.probe.selection(), null, 'something is selected')
    assert.equal(await claude.isShowing(ADD_LABEL), false, 'nothing is offered')
    await claude.press('ctrl+u')
  })

  scenario(FILTERS, "the pane's own words are not offered", { drivers: ['herdr'] }, async ctx => {
    const claude = await ctx.launchFixture()
    await claude.add('so reading it failed')
    await claude.comment(1, 'mine')
    // The first row says the selection is added, as ①.
    for (const words of [addedNote(1), SOURCE_HINT.assistant, 'so reading it', `${COMMENT_LABEL}: mine`]) {
      await ctx.step(`select “${words}” in the pane`)
      const spot = await claude.findInPane(words)
      await claude.mouse.drag({ x: spot.x, y: spot.y }, { x: spot.x + spot.width - 1, y: spot.y })
      assert.equal(await claude.offers(), false, `“${words}” was offered`)
      await claude.press('escape')
    }
    assert.equal((await claude.probe.pending()).length, 1)
  })
})
