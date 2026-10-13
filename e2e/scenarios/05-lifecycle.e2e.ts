// A session's life: hot reload, /clear, the main screen, ctrl+o.
import { utimes } from 'node:fs/promises'
import { join } from 'node:path'
import { describe } from 'node:test'

import { sleep, waitFor } from '../harness/exec.ts'
import { PLUGIN_DIR } from '../harness/fixtures.ts'
import { assert, scenario } from '../harness/scenario.ts'

const LIFE = 'lifecycle'

describe(LIFE, () => {
  scenario(LIFE, 'a hot reload keeps the Annotations and the open Comment field', { drivers: ['herdr'] }, async ctx => {
    const claude = await ctx.launchFixture()
    await claude.scrollTo('so reading it failed')
    await claude.add('so reading it failed')
    await claude.waitShowing('① Add an optional comment')
    await ctx.step('touch the hooks module: the session reloads add-to-chat')
    const now = new Date()
    await utimes(join(PLUGIN_DIR, 'hooks', 'register.tsx'), now, now)
    await waitFor('the reload notice', async () => /add-to-chat: reloaded/.test(await claude.screen()), { timeoutMs: 20_000 })
    await claude.waitShowing('① Add an optional comment')
    await claude.comment(1, 'after reload')
    assert.equal((await claude.probe.pending())[0]?.comment, 'after reload')
  })

  scenario(LIFE, '/clear drops the pending Annotations', { drivers: ['herdr'] }, async ctx => {
    const claude = await ctx.launchFixture()
    await claude.scrollTo('so reading it failed')
    await claude.add('so reading it failed')
    await claude.command('/clear')
    await waitFor('the list to empty', async () => (await claude.probe.pending()).length === 0, { timeoutMs: 10_000 })
    await claude.waitShowing('select text in the transcript')
  })

  scenario(LIFE, 'outside fullscreen /add-to-chat says fullscreen is needed', { drivers: ['herdr', 'tmux'] }, async ctx => {
    const claude = await ctx.launch({ name: 'main-screen', slot: 'side', fullscreen: false })
    await claude.command('/add-to-chat')
    await waitFor('the toast', async () => (await claude.toasts()).some(t => /needs fullscreen/.test(t)), { timeoutMs: 8_000 })
    assert.equal(await claude.isShowing('select text in the transcript'), false, 'no band on the main screen')
  })

  scenario(LIFE, 'ctrl+o: what is selected in the transcript view is offered once back', { drivers: ['herdr'] }, async ctx => {
    const claude = await ctx.launchFixture()
    await claude.press('ctrl+o')
    await sleep(1_500)
    await ctx.step('select a phrase of the reply in the transcript view')
    await claude.scrollTo('Background command')
    const selected = await claude.select('Background command')
    assert.ok(selected.requestId !== undefined)
    await claude.press('ctrl+o')
    await claude.waitShowing('“Background command”', 6_000)
    const added = await claude.addSelected()
    assert.equal(added.text, 'Background command')
  })
})
