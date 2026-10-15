// A session's life: hot reload, /clear, the main screen, ctrl+o.
import { appendFile, cp } from 'node:fs/promises'
import { join } from 'node:path'
import { describe } from 'node:test'

import { NEEDS_FULLSCREEN, PANE_EMPTY } from '../../add-to-chat/hooks/labels.ts'
import { framed } from '../harness/claude.ts'
import { sleep, waitFor } from '../harness/exec.ts'
import { PLUGIN_DIR } from '../harness/fixtures.ts'
import { paneArea } from '../harness/screen.ts'
import { assert, scenario } from '../harness/scenario.ts'

const LIFE = 'lifecycle'

describe(LIFE, () => {
  scenario(LIFE, 'a hot reload keeps the Annotations and the pane', { drivers: ['herdr'] }, async ctx => {
    // A copy of the mod, so the edit below never touches the repository's.
    const copy = join(await ctx.sandbox(), 'add-to-chat')
    await cp(PLUGIN_DIR, copy, { recursive: true })
    const claude = await ctx.launchFixture({ pluginDir: copy })
    await claude.add('so reading it failed')
    // A touch that changes only the file's time reloads nothing: the text must change.
    await ctx.step('edit the hooks module: the session reloads add-to-chat')
    await appendFile(join(copy, 'hooks', 'register.tsx'), '// edited by the hot reload scenario\n')
    await waitFor('the reload notice', async () => /add-to-chat: reloaded/.test(await claude.screen()), { timeoutMs: 20_000 })
    await waitFor('the pane with its tab', () => claude.paneShows(framed('so reading it failed')), { timeoutMs: 10_000 })
    await claude.comment(1, 'after reload')
    assert.equal((await claude.probe.pending())[0]?.comment, 'after reload')
  })

  scenario(LIFE, '/clear drops the pending Annotations', { drivers: ['herdr'] }, async ctx => {
    const claude = await ctx.launchFixture()
    await claude.add('so reading it failed')
    await claude.command('/clear')
    await waitFor('the list to empty', async () => (await claude.probe.pending()).length === 0, { timeoutMs: 10_000 })
    await waitFor('the pane to say so', () => claude.paneShows(PANE_EMPTY), { timeoutMs: 5_000 })
  })

  scenario(LIFE, 'outside fullscreen /add-to-chat says fullscreen is needed', { drivers: ['herdr', 'tmux'] }, async ctx => {
    const claude = await ctx.launch({ name: 'main-screen', slot: 'side', fullscreen: false })
    await claude.command('/add-to-chat')
    await waitFor('the toast', async () => (await claude.toasts()).includes(NEEDS_FULLSCREEN), { timeoutMs: 8_000 })
    assert.equal(paneArea(await claude.screen()), undefined, 'no pane on the main screen')
  })

  scenario(LIFE, 'ctrl+o: what is selected in the transcript view is offered once back', { drivers: ['herdr'] }, async ctx => {
    const claude = await ctx.launchFixture()
    await claude.press('ctrl+o')
    await sleep(1_500)
    await ctx.step('select a phrase of the reply in the transcript view')
    const selected = await claude.select('Background command')
    assert.ok(selected.requestId !== undefined)
    await claude.press('ctrl+o')
    await waitFor('the offer', () => claude.paneShows('“Background command”'), { timeoutMs: 6_000 })
    const added = await claude.addSelected()
    assert.equal(added.text, 'Background command')
  })
})
