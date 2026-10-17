// A sent prompt's Annotations, seen again: the 📎 row under the prompt
// (Claude Code's own row above it, untouched), its hover card, the pane's
// read-only view of them, the jump back to the prompt, the history list,
// all of it after the session is resumed; a rewind to it, and ↑ to it.
import { describe } from 'node:test'

import { BACK_LABEL, HISTORY_TITLE, JUMP_LABEL, SENT_TITLE, clipButtonLabel, clipLine, historyLabel } from '../../add-to-chat/hooks/labels.ts'
import { framed } from '../harness/claude.ts'
import type { ClaudeSession } from '../harness/claude.ts'
import { sleep, waitFor } from '../harness/exec.ts'
import { FIXTURE_SESSION } from '../harness/fixtures.ts'
import { locate, textIn, transcriptArea } from '../harness/screen.ts'
import { assert, scenario } from '../harness/scenario.ts'

const HISTORY = 'history'
const REQUEST = 'HISTORY-1: reply with the single word OK.'
const REWIND = 'HISTORY-2: reply with the single word OK.'
const RECALL = 'HISTORY-3: reply with the single word OK.'
const FROM_A = 'HISTORY-4A: reply with the single word OK.'
const FROM_B = 'HISTORY-4B: reply with the single word OK.'

/** The transcript's rows, the pane's left out. */
async function transcript(claude: ClaudeSession): Promise<string> {
  const screen = await claude.screen()
  return textIn(screen, transcriptArea(screen)).join('\n')
}

/** Where `needle` sits in the transcript. */
async function spotIn(claude: ClaudeSession, needle: string) {
  const screen = await claude.screen()
  const spot = locate(screen, needle, 1, transcriptArea(screen))
  assert.ok(spot, `"${needle}" in the transcript`)
  return spot
}

describe(HISTORY, () => {
  scenario(HISTORY, 'a sent prompt: its 📎 row, the hover card, the pane on it, the jump back, the list, after --resume', { drivers: ['herdr'], usesModel: true }, async ctx => {
    const claude = await ctx.launchFixture()
    await ctx.step('send a prompt with two Annotations, one Commented')
    await claude.add('so reading it failed')
    await claude.comment(1, 'why did it fail?')
    await claude.add('Ran the')
    const before = await claude.probe.turnsCompleted()
    await claude.submit(REQUEST)
    await waitFor('the reply', async () => (await claude.probe.turnsCompleted()) > before, { timeoutMs: 120_000, intervalMs: 1_000 })
    await sleep(800)

    await ctx.step("Claude Code draws the prompt as typed; the mod's 📎 row sits under it")
    const rows = (await transcript(claude)).split('\n')
    const at = rows.findIndex(r => r.startsWith(`❯ ${REQUEST}`))
    assert.ok(at >= 0, 'the prompt row, as typed, with its ❯')
    assert.equal(rows[at + 1]?.trim(), clipButtonLabel(2), 'the 📎 row right under it')
    await ctx.evidence('screen with the 📎 row', await claude.screen())

    await ctx.step('hovering over the 📎 shows a card of the Annotations, above it; it goes when the pointer leaves')
    const clip = await spotIn(claude, clipButtonLabel(2))
    await claude.mouse.hover({ x: clip.x + 2, y: clip.y })
    await waitFor('the card', async () => (await transcript(claude)).includes('“so reading it failed”'), { timeoutMs: 4_000 })
    const card = await transcript(claude)
    assert.match(card, /why did it fail\?/)
    assert.match(card, /“Ran the”/)
    const ansi = await claude.term.screenAnsi?.()
    if (ansi !== undefined) {
      await ctx.evidence('ansi with the card', ansi)
      // The escape right before the card's text: its background, not the pane's.
      const cardRow = ansi.split('\n').find(l => l.includes('“Ran the”')) ?? ''
      const before = cardRow.slice(0, cardRow.indexOf('“Ran the”'))
      assert.match(before.slice(before.lastIndexOf('\x1b[48;')), /^\x1b\[48;/, 'the card has a background, so the rows beneath do not show through')
    }
    await ctx.evidence('screen with the card', await claude.screen())
    await claude.mouse.hover({ x: 3, y: 2 })
    await waitFor('the card to go', async () => !(await transcript(claude)).includes('“so reading it failed”'), { timeoutMs: 4_000 })

    await ctx.step('pressing the 📎 opens the pane on that prompt: its Annotations, read-only')
    await claude.mouse.click({ x: clip.x + 2, y: clip.y })
    await waitFor('the sent view', () => claude.paneShows(`${SENT_TITLE} “HISTORY-1`), { timeoutMs: 5_000 })
    assert.ok(await claude.paneShows(framed('so reading it failed')))
    assert.ok(await claude.paneShows('Comment: why did it fail?'))
    await claude.clickInPane('2: Claude', { dx: 4 })
    await waitFor('tab ②', () => claude.paneShows(framed('Ran the')), { timeoutMs: 5_000 })
    await ctx.evidence('screen with the pane on the sent prompt', await claude.screen())

    await ctx.step(`scroll the prompt away; “${JUMP_LABEL}” brings it back`)
    await claude.mouse.wheel('up', 20)
    await waitFor('the prompt to scroll away', async () => !(await transcript(claude)).includes(REQUEST), { timeoutMs: 5_000 })
    await claude.clickInPane(JUMP_LABEL, { dx: 1 })
    await waitFor('the prompt back in view', async () => (await transcript(claude)).includes(REQUEST), { timeoutMs: 5_000 })

    await ctx.step(`${BACK_LABEL}: the list of prompts sent with Annotations; again: the pending view, with its way back to the list`)
    await claude.clickInPane(BACK_LABEL, { dx: 1 })
    await waitFor('the list', () => claude.paneShows(HISTORY_TITLE), { timeoutMs: 5_000 })
    assert.ok(await claude.paneShows(clipLine(2)))
    await claude.clickInPane(BACK_LABEL, { dx: 1 })
    // Only this conversation's prompts, whatever the store keeps from other sessions.
    await waitFor('the pending view', () => claude.paneShows(historyLabel(1)), { timeoutMs: 5_000 })

    await ctx.step('resumed in a new session, the 📎 row and the pane on it still work')
    await claude.close()
    const again = await ctx.launch({ name: 'again', cwd: claude.cwd, resume: FIXTURE_SESSION })
    await waitFor('the 📎 row', async () => (await transcript(again)).includes(clipButtonLabel(2)), { timeoutMs: 30_000 })
    const clip2 = await spotIn(again, clipButtonLabel(2))
    await again.mouse.click({ x: clip2.x + 2, y: clip2.y })
    await waitFor('the sent view after --resume', () => again.paneShows(framed('so reading it failed')), { timeoutMs: 5_000 })
    await ctx.evidence('screen after --resume', await again.screen())

    // A slash command typed and entered (the sticky header can hide the draft from `command`).
    const run = async (session: ClaudeSession, line: string) => {
      await session.type(line)
      await sleep(600)
      await session.press('enter')
    }

    await ctx.step('/branch: the fork holds the prompt, so its row and the history stay; the originals come back from the store')
    await again.clickInPane(BACK_LABEL, { dx: 1 }).catch(() => undefined)
    await run(again, '/branch')
    // The row as typed, not the template, with its 📎 row under it.
    await waitFor('the forked prompt row', async () => {
      const rows = (await transcript(again)).split('\n')
      const at = rows.findIndex(r => r.startsWith(`❯ ${REQUEST}`))
      return at >= 0 && rows[at + 1]?.trim() === clipButtonLabel(2)
    }, { timeoutMs: 15_000 })
    await waitFor('the history in the fork', () => again.paneShows(historyLabel(1)), { timeoutMs: 5_000 })

    await ctx.step('/clear: a new conversation, an empty history')
    await run(again, '/clear')
    await waitFor('the history to go', async () => !(await again.pane()).join('\n').includes('History ('), { timeoutMs: 10_000 })
  })

  scenario(HISTORY, "↑ to a prompt sent with Annotations brings them back, stepping on takes them out; another conversation's ↑ brings back only the text", { drivers: ['herdr'], usesModel: true }, async ctx => {
    const claude = await ctx.launchFixture()
    await claude.add('so reading it failed')
    await claude.submit(RECALL)
    const pending = async () => (await claude.probe.pending()).map(a => a.text)
    await ctx.step('↑: the request as typed, its Annotation pending again')
    await claude.press('up')
    await waitFor('the request as typed', async () => (await claude.draft()) === RECALL, { timeoutMs: 5_000 })
    await waitFor('the Annotation back', async () => (await pending()).length === 1, { timeoutMs: 3_000 })
    await ctx.step('↓ out of the history: the Annotation goes with the entry')
    await claude.press('down')
    await waitFor('the Annotation gone', async () => (await pending()).length === 0, { timeoutMs: 3_000 })
    await ctx.step('↑ again: the history now holds what was typed; the Annotation comes back')
    await claude.press('up')
    await waitFor('the Annotation back', async () => (await pending()).length === 1, { timeoutMs: 3_000 })
    assert.equal(await claude.draft(), RECALL)
    await ctx.step('Esc Esc empties the box: the Annotation goes with the prompt')
    await claude.press('escape')
    await sleep(150)
    await claude.press('escape')
    await waitFor('the box empty', async () => (await claude.draft()) === '', { timeoutMs: 3_000 })
    await waitFor('the Annotation gone', async () => (await pending()).length === 0, { timeoutMs: 4_000 })

    await ctx.step('a new conversation in the same project: ↑ gives back the request as typed, without the Annotation, whose row is not in it')
    await claude.close()
    const fresh = await ctx.launch({ name: 'fresh', cwd: claude.cwd })
    await fresh.press('up')
    await waitFor('the request as typed', async () => (await fresh.draft()) === RECALL, { timeoutMs: 5_000 })
    await sleep(800)
    assert.deepEqual(await fresh.probe.pending(), [])
  })

  scenario(HISTORY, 'a rewind to a prompt sent with Annotations gives back what was typed, and its Annotations pending again', { drivers: ['herdr'], usesModel: true }, async ctx => {
    const claude = await ctx.launchFixture()
    await claude.add('so reading it failed')
    await claude.comment(1, 'why did it fail?')
    await claude.submit(REWIND)
    await ctx.step('Esc Esc, the prompt just sent, Restore conversation')
    await claude.press('escape')
    await sleep(150)
    await claude.press('escape')
    await waitFor('the rewind menu', async () => (await claude.screen()).includes('Restore the code and/or conversation'), { timeoutMs: 5_000 })
    await claude.press('up')
    await waitFor('the prompt chosen', async () => (await claude.screen()).includes(`❯ ${REWIND}`), { timeoutMs: 3_000 })
    await claude.press('enter')
    await waitFor('the confirmation', async () => (await claude.screen()).includes('Restore conversation'), { timeoutMs: 5_000 })
    await claude.press('enter')
    await ctx.step('the prompt box holds the request as typed, not the template; the Annotation is pending again, its Comment too')
    await waitFor('the request as typed', async () => (await claude.draft()) === REWIND, { timeoutMs: 5_000 })
    await waitFor('the Annotation pending again', async () => (await claude.probe.pending()).length === 1, { timeoutMs: 3_000 })
    assert.deepEqual((await claude.probe.pending()).map(a => [a.text, a.comment]), [['so reading it failed', 'why did it fail?']])
    await ctx.evidence('screen after the rewind', await claude.screen())
    await ctx.step('a selection is offered and added as before')
    await claude.add('Ran the')
    assert.equal((await claude.probe.pending()).length, 2)
  })

  scenario(HISTORY, "two sessions at once: one sending after the other keeps the other's prompt; resumed, it still has its 📎 row", { drivers: ['herdr'], usesModel: true }, async ctx => {
    // Both load the store first: the second used to write its whole copy over the first's.
    const a = await ctx.launchFixture({ name: 'session-a' })
    const b = await ctx.launchFixture({ name: 'session-b', slot: 'side' })
    const sendFrom = async (session: ClaudeSession, excerpt: string, prompt: string) => {
      await session.add(excerpt)
      const before = await session.probe.turnsCompleted()
      await session.submit(prompt)
      await waitFor('the reply', async () => (await session.probe.turnsCompleted()) > before, { timeoutMs: 120_000, intervalMs: 1_000 })
    }
    await ctx.step('session A sends a prompt with an Annotation, then session B one')
    await sendFrom(a, 'so reading it failed', FROM_A)
    await sendFrom(b, 'Ran the', FROM_B)

    await ctx.step("A resumed: its prompt row draws what was typed, its 📎 row under it")
    await a.close()
    const again = await ctx.launch({ name: 'session-a-again', cwd: a.cwd, resume: FIXTURE_SESSION })
    await waitFor("A's prompt as typed, its 📎 row under it", async () => {
      const rows = (await transcript(again)).split('\n')
      const at = rows.findIndex(r => r.startsWith(`❯ ${FROM_A}`))
      return at >= 0 && rows[at + 1]?.trim() === clipButtonLabel(1)
    }, { timeoutMs: 30_000 })
    await ctx.evidence('screen of A resumed', await again.screen())
  })

})
