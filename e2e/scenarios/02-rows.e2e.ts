// Every kind of transcript row can be added: what the selection reads, the
// row it lies in, the Source it gets, and where its mark shows.
import { describe } from 'node:test'

import { circled, superscript } from '../../add-to-chat/hooks/labels.ts'
import type { ClaudeSession } from '../harness/claude.ts'
import { OTHER_ROWS, REPLY_ROWS } from '../fixtures/rows.ts'
import type { FixtureRow } from '../fixtures/rows.ts'
import { assert, scenario } from '../harness/scenario.ts'
import type { Context } from '../harness/scenario.ts'

const ROWS = 'rows'

async function addEach(ctx: Context, claude: ClaudeSession, rows: readonly FixtureRow[]) {
  const table: string[] = []
  for (const [i, row] of rows.entries()) {
    const index = i + 1
    await ctx.step(`${circled(index)} ${row.kind}: “${row.text}”`)
    const selected = await claude.select(row.text, { nth: row.nth, expectRow: row.components !== undefined })
    const component = await claude.probe.componentOf(selected.requestId)
    const added = await claude.addSelected()
    assert.equal(added.index, index)
    assert.equal(added.text, row.text, `${row.kind}: the Excerpt`)
    assert.equal(added.source, row.source, `${row.kind}: the Source`)
    if (row.components === undefined) {
      assert.equal(component, undefined, `${row.kind}: drawn by no hooked component`)
    } else {
      assert.ok(component !== undefined && row.components.includes(component), `${row.kind}: drawn as ${component}, not ${row.components.join('/')}`)
    }
    table.push(`${circled(index)} ${row.kind.padEnd(38)} ${added.source.padEnd(10)} ${component ?? '(no ui.render)'}  “${row.text}”`)
  }
  await ctx.evidence('annotations', table.join('\n'))
}

async function checkMarks(ctx: Context, claude: ClaudeSession, rows: readonly FixtureRow[]) {
  for (const [i, row] of rows.entries()) {
    const index = i + 1
    if (row.mark === 'after') {
      const marked = `${row.markAfter ?? row.text}${superscript(index)}`
      await claude.scrollTo(marked)
    } else if (row.mark === 'head') {
      // An Excerpt the markdown cannot place is marked at the head of its row.
      await claude.scrollTo(circled(index))
      const head = (await claude.screen()).split('\n').find(r => r.includes(circled(index)))
      assert.match(head ?? '', /^⏺ [①-⑳㉑-㊿]+/, `${row.kind}: marked at the head of the reply`)
    }
  }
}

describe(ROWS, () => {
  scenario(ROWS, 'prompts and replies: each Excerpt gets its Source and a mark where it was selected', { drivers: ['herdr'], timeoutMs: 420_000 }, async ctx => {
    const claude = await ctx.launchFixture()
    await addEach(ctx, claude, REPLY_ROWS)
    await ctx.step('every mark shows where its Excerpt was selected')
    await checkMarks(ctx, claude, REPLY_ROWS)
    await ctx.evidence('screen with marks', await claude.screen())
  })

  scenario(ROWS, 'tools, notifications, bash mode, commands and plugin prompts: added with Source transcript', { drivers: ['herdr'], timeoutMs: 420_000 }, async ctx => {
    const claude = await ctx.launchFixture()
    await addEach(ctx, claude, OTHER_ROWS)
    await claude.openList()
    await ctx.evidence('band', (await claude.band()).join('\n'))
  })

  scenario(ROWS, 'a reply and a prompt row: added with their Sources (basic)', { drivers: ['tmux'] }, async ctx => {
    const claude = await ctx.launchFixture()
    await addEach(ctx, claude, [REPLY_ROWS[0]!, REPLY_ROWS[2]!, OTHER_ROWS[0]!])
    await checkMarks(ctx, claude, [REPLY_ROWS[0]!, REPLY_ROWS[2]!])
  })
})
