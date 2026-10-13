import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { hashText } from '../hooks/hash'
import { BAND, XML_TEMPLATE, drawRow, runCommand, start, submit, tick } from './world'

const SURFACES = ['terminal', 'desktop'] as const

/** Writes a Comment through the band's field. */
async function ui_comment($: Engine, w: unknown, index: number, text: string) {
  const ui = await $.ui.mount({ plugin: 'add-to-chat', surface: 'terminal', ...BAND })
  await ui.input({ key: `comment-${index}`, text })
  await ui.unmount()
}

/** The shown text of the band's list row for one Annotation. */
async function listRow(ui: { find: (q: { key: string }) => Promise<{ text: string } | undefined> }, index: number) {
  return (await ui.find({ key: `row-${index}` }))?.text ?? ''
}
const REPLY = 'Run `npm test` before you **commit the change**.'

describe('adding a selection', () => {
  for (const surface of SURFACES) {
    test(`Add to chat makes an Annotation with its Source (${surface})`, async ($, on) => {
      const w = await start($, on)
      await drawRow($, w, 'AssistantMessage', 'r1', REPLY)
      const ui = await $.ui.mount({ plugin: 'add-to-chat', surface, ...BAND })
      expect(await ui.find({ key: 'add' })).toBeUndefined()

      w.selection = { text: 'npm test before you commit', requestId: 'r1' }
      await tick(w)
      expect((await ui.find({ type: 'Text', text: /npm test before you commit/ }))).toBeDefined()

      await ui.press({ key: 'add' })
      expect(await ui.find({ key: 'add' })).toBeUndefined()
      expect(await ui.find({ key: 'comment-1' })).toBeDefined()

      await ui.input({ key: 'comment-1', text: 'is this needed?' })
      expect(await ui.find({ key: 'comment-1' })).toBeUndefined()
      expect((await ui.find({ key: 'list' }))?.text).toContain('1 annotation')

      await ui.press({ key: 'list' })
      expect(await listRow(ui, 1)).toMatch(/① Claude\s+“npm test before you commit” — is this needed\?/)

      // The same selection keeps being returned; it is not offered again.
      await tick(w)
      expect(await ui.find({ key: 'add' })).toBeUndefined()
      await ui.unmount()
    })
  }

  test('a prompt row is Source you; a selection outside any row is transcript', async ($, on) => {
    const w = await start($, on)
    await drawRow($, w, 'UserMessage', 'u1', 'my earlier idea about caching')
    w.selection = { text: 'earlier idea', requestId: 'u1' }
    await runCommand($, w)
    w.selection = { text: 'Bash(ls)\n  a.txt' }
    await runCommand($, w)
    const ui = await $.ui.mount({ plugin: 'add-to-chat', surface: 'terminal', ...BAND })
    await ui.press({ key: 'list' })
    expect(await listRow(ui, 1)).toMatch(/① You\s+“earlier idea”/)
    expect(await listRow(ui, 2)).toMatch(/② Transcript\s+“Bash\(ls\) a.txt”/)
  })

  test('the Comment field stays open after /add-to-chat clears the prompt', async ($, on) => {
    const w = await start($, on)
    w.draft = '/add-to-chat'
    await tick(w)
    w.selection = { text: 'npm test', requestId: 'r1' }
    w.draft = ''
    await runCommand($, w)
    await tick(w)
    await tick(w)
    const ui = await $.ui.mount({ plugin: 'add-to-chat', surface: 'terminal', ...BAND })
    expect(await ui.find({ key: 'comment-1' })).toBeDefined()

    // Typing in the prompt means the person left the field.
    w.draft = 'now my question'
    await tick(w)
    expect(await ui.find({ key: 'comment-1' })).toBeUndefined()
  })

  test('an Excerpt already pending is not offered or added again', async ($, on) => {
    const w = await start($, on)
    w.selection = { text: 'npm test', requestId: 'r1' }
    await runCommand($, w)
    w.selection = { text: 'something else', requestId: 'r1' }
    await runCommand($, w)
    w.selection = { text: 'npm test', requestId: 'r1' }
    await tick(w)
    const ui = await $.ui.mount({ plugin: 'add-to-chat', surface: 'terminal', ...BAND })
    expect(await ui.find({ key: 'add' })).toBeUndefined()
    await runCommand($, w)
    expect(w.toasts.at(-1)).toMatch(/already added/)
    expect((await ui.find({ key: 'list' }))?.text).toContain('2 annotations')
    // The same words in another row are another Excerpt.
    w.selection = { text: 'npm test', requestId: 'r2' }
    await tick(w)
    expect(await ui.find({ key: 'add' })).toBeDefined()
  })

  describe('selections that are not transcript text are not offered', () => {
    test('the 📎 line under a rewritten prompt', async ($, on) => {
      const w = await start($, on)
      w.selection = { text: '📎 2 annotations', requestId: 'u1' }
      await tick(w)
      await runCommand($, w)
      expect(w.toasts.at(-1)).toMatch(/Select text/)
      w.selection = { text: '📎 2 annot', requestId: 'u1' }
      await runCommand($, w)
      expect(w.toasts.at(-1)).toMatch(/Select text/)
      w.selection = { text: 'my question\n  📎', requestId: 'u1' }
      await tick(w)
      const band = await $.ui.mount({ plugin: 'add-to-chat', surface: 'terminal', ...BAND })
      expect(await band.find({ type: 'Text', text: '“my question”' })).toBeDefined()
      await runCommand($, w)
      const ui = await $.ui.mount({ plugin: 'add-to-chat', surface: 'terminal', ...BAND })
      await ui.press({ key: 'list' })
      expect(await listRow(ui, 1)).toMatch(/“my question”/)
    })

    test('the draft in the prompt box', async ($, on) => {
      const w = await start($, on)
      w.draft = 'DRAFT-TEXT here in the prompt box'
      w.selection = { text: 'DRAFT-TEXT here' }
      await tick(w)
      const ui = await $.ui.mount({ plugin: 'add-to-chat', surface: 'terminal', ...BAND })
      expect(await ui.find({ key: 'add' })).toBeUndefined()
      await runCommand($, w)
      expect(w.toasts.at(-1)).toMatch(/Select text/)
    })

    test("the band's own words", async ($, on) => {
      const w = await start($, on)
      w.selection = { text: 'npm test', requestId: 'r1' }
      await runCommand($, w)
      for (const text of ['Add an optional comment', '📎 1 annotation ▸', '① Transcript   “npm test”', 'nothing to add?', 'select text in the transcript']) {
        w.selection = { text }
        await tick(w)
        await runCommand($, w)
        expect(w.toasts.at(-1)).toMatch(/Select text/)
      }
    })

    test('a selection spanning rows that is not band text is still offered, and stays offered', async ($, on) => {
      const w = await start($, on)
      w.draft = 'unrelated draft'
      w.selection = { text: 'end of one reply\n\nstart of the next' }
      await tick(w)
      const ui = await $.ui.mount({ plugin: 'add-to-chat', surface: 'terminal', ...BAND })
      expect(await ui.find({ key: 'add' })).toBeDefined()
      // Its preview in the band is not band text that hides it again.
      await tick(w)
      expect(await ui.find({ key: 'add' })).toBeDefined()
    })
  })

  test('a narrow band shrinks its words before the preview', async ($, on) => {
    const w = await start($, on)
    w.selection = { text: 'first', requestId: 'r1' }
    await runCommand($, w)
    w.selection = { text: 'a phrase long enough to need some room', requestId: 'r1' }
    await tick(w)
    const narrow = { ...BAND, props: { ...BAND.props, bodyColumns: 78 } }
    const ui = await $.ui.mount({ plugin: 'add-to-chat', surface: 'terminal', ...narrow })
    const head = (await ui.find({ key: 'head' }))?.text ?? ''
    // "nothing to add?" goes first; the preview keeps a dozen cells.
    expect(head).toMatch(/“a phrase long en…”/)
    expect(head).toContain('📎 1 annotation ▸')
    expect(head).not.toContain('nothing to add?')
  })

  describe('in the fullscreen terminal the head row is always there, one row high', () => {
    const FULL = { ...BAND, viewport: { columns: 102, rows: 40, isFullscreen: true } }
    for (const surface of SURFACES) {
      test(`hint, then the offer, then the count, in the same row (${surface})`, async ($, on) => {
        const w = await start($, on)
        const ui = await $.ui.mount({ plugin: 'add-to-chat', surface, ...FULL })
        const rows = async () => (await ui.findAll({ type: 'Box' })).filter(b => b.key === 'head' || b.key === 'comment' || b.key?.startsWith('row-')).length
        expect(await ui.find({ type: 'Text', text: /select text in the transcript/ })).toBeDefined()
        expect(await rows()).toBe(1)
        w.selection = { text: 'Ran the subagent', requestId: 'r1' }
        await tick(w)
        expect(await ui.find({ key: 'add' })).toBeDefined()
        expect(await rows()).toBe(1)
        await ui.press({ key: 'add' })
        await ui.input({ key: 'comment-1', text: '' })
        w.selection = { text: 'something else', requestId: 'r1' }
        await tick(w)
        expect((await ui.find({ key: 'head' }))?.text).toMatch(/✚ Add to chat“something else”.*📎 1 annotation ▸/)
        expect(await rows()).toBe(1)
      })
    }
  })

  test('ignoring a selection hides the button until another selection', async ($, on) => {
    const w = await start($, on)
    const ui = await $.ui.mount({ plugin: 'add-to-chat', surface: 'terminal', ...BAND })
    w.selection = { text: 'not this', requestId: 'r1' }
    await tick(w)
    await ui.press({ key: 'ignore' })
    await tick(w)
    expect(await ui.find({ key: 'add' })).toBeUndefined()
    w.selection = { text: 'this one', requestId: 'r1' }
    await tick(w)
    expect(await ui.find({ key: 'add' })).toBeDefined()
  })

  test('/clear drops pending Annotations', async ($, on) => {
    const w = await start($, on)
    w.selection = { text: 'npm test', requestId: 'r1' }
    await runCommand($, w)
    await $.session.end({ reason: 'clear', sessionId: 's1' } as never)
    await submit($, 'fresh start')
    expect(w.submitted[0]).toEqual({ text: 'fresh start', context: undefined })
  })

  test('a band with one row shows the most needed one, never the list', async ($, on) => {
    const w = await start($, on)
    w.selection = { text: 'npm test', requestId: 'r1' }
    await runCommand($, w)
    const ui = await $.ui.mount({ plugin: 'add-to-chat', surface: 'terminal', ...BAND, props: { ...BAND.props, maxRows: 1 } })
    // The Comment field while it is open…
    expect(await ui.find({ key: 'comment-1' })).toBeDefined()
    expect(await ui.find({ key: 'head' })).toBeUndefined()
    // …then the head row; the list never fits.
    await ui.input({ key: 'comment-1', text: 'ok' })
    await ui.press({ key: 'list' })
    expect(await ui.find({ key: 'head' })).toBeDefined()
    expect(await ui.find({ key: 'row-1' })).toBeUndefined()
  })

  test('removing renumbers the rest', async ($, on) => {
    const w = await start($, on)
    for (const text of ['first', 'second', 'third']) {
      w.selection = { text, requestId: 'r1' }
      await runCommand($, w)
    }
    const ui = await $.ui.mount({ plugin: 'add-to-chat', surface: 'terminal', ...BAND })
    await ui.press({ key: 'list' })
    await ui.press({ key: 'remove-1' })
    expect((await ui.find({ key: 'list' }))?.text).toContain('2 annotations')
    expect(await listRow(ui, 1)).toMatch(/① Transcript\s+“second”/)
    expect(await listRow(ui, 2)).toMatch(/② Transcript\s+“third”/)
  })

  test('/add-to-chat with no selection outside fullscreen says fullscreen is needed', async ($, on) => {
    const w = await start($, on)
    w.isFullscreen = false
    const ran = await runCommand($, w)
    expect(ran.text).toBeUndefined()
    expect(w.toasts.at(-1)).toMatch(/fullscreen/)
  })

  test('/add-to-chat in fullscreen with nothing selected asks for a selection', async ($, on) => {
    const w = await start($, on)
    await runCommand($, w)
    expect(w.toasts.at(-1)).toMatch(/Select text/)
  })
})

describe('marks in the transcript', () => {
  test('a pending Annotation is marked after its Excerpt; cleared after submit', async ($, on) => {
    const w = await start($, on)
    await drawRow($, w, 'AssistantMessage', 'r1', REPLY)
    w.selection = { text: 'commit the change', requestId: 'r1' }
    await runCommand($, w)
    expect(await drawRow($, w, 'AssistantMessage', 'r1', REPLY)).toBe('Run `npm test` before you **commit the change**`⁽¹⁾`.')
    expect(await drawRow($, w, 'AssistantMessage', 'r2', REPLY)).toBe(REPLY)
    await submit($, 'go')
    expect(await drawRow($, w, 'AssistantMessage', 'r1', REPLY)).toBe(REPLY)
  })

  test('ctrl+o draws marks on the full prompt the model read', async ($, on) => {
    const w = await start($, on)
    await drawRow($, w, 'UserMessage', 'u1', 'please refactor the parser')
    w.selection = { text: 'refactor', requestId: 'u1' }
    await runCommand($, w)
    expect(await drawRow($, w, 'UserMessage', 'u1', 'please refactor the parser', { isExpanded: true })).toBe(
      'please refactor`⁽¹⁾` the parser',
    )
  })

  test('an Excerpt not found in the markdown is marked at the head of the row', async ($, on) => {
    const w = await start($, on)
    await drawRow($, w, 'AssistantMessage', 'r1', 'Some reply text.')
    w.selection = { text: 'text the markdown never had', requestId: 'r1' }
    await runCommand($, w)
    expect(await drawRow($, w, 'AssistantMessage', 'r1', 'Some reply text.')).toBe('`①` Some reply text.')
  })

  test('a background-task notification row is not one of your prompts', async ($, on) => {
    const w = await start($, on)
    await drawRow($, w, 'UserMessage', 'n1', 'Background command "sleep" completed', {
      origin: { kind: 'task-notification' },
      task: { id: 't1', status: 'completed' },
    })
    w.selection = { text: 'Background command', requestId: 'n1' }
    await runCommand($, w)
    await submit($, 'what finished?')
    expect(w.submitted[0]!.text).toContain('"role": "transcript"')
    // Its row is drawn as the engine has it: no mark, no rewrite.
    expect(
      await drawRow($, w, 'UserMessage', 'n1', 'Background command "sleep" completed', { origin: { kind: 'task-notification' } }),
    ).toBe('Background command "sleep" completed')
  })

  test('a summary block keeps its isSummary when marked', async ($, on) => {
    const w = await start($, on)
    await drawRow($, w, 'AssistantMessage', 's1', 'Checked the parser and the lexer.', { isSummary: true })
    w.selection = { text: 'the lexer', requestId: 's1' }
    await runCommand($, w)
    await drawRow($, w, 'AssistantMessage', 's1', 'Checked the parser and the lexer.', { isSummary: true })
    expect(w.drawnProps.s1).toMatchObject({ text: 'Checked the parser and the lexer`⁽¹⁾`.', isSummary: true })
  })

  test('a Citation is drawn as its number and the directive is hidden', async ($, on) => {
    const w = await start($, on)
    const drawn = await drawRow($, w, 'AssistantMessage', 'r9', 'Done :annotation{index="2"}.')
    expect(drawn).toBe('Done `②`.')
  })
})

describe('sending', () => {
  test('the default template rewrites the prompt, and the row draws the original', async ($, on) => {
    const w = await start($, on)
    await drawRow($, w, 'AssistantMessage', 'r1', REPLY)
    w.selection = { text: 'npm test', requestId: 'r1' }
    await runCommand($, w)
    const entered = await submit($, 'why?')
    expect(w.submitted).toHaveLength(1)
    expect(w.submitted[0]!.text).toStartWith('# Response annotations:')
    expect(w.submitted[0]!.text).toContain('"text": "npm test"')
    expect(w.submitted[0]!.text).toEndWith('## My request:\nwhy?')
    expect(entered.text).toBe(w.submitted[0]!.text)

    expect(await drawRow($, w, 'UserMessage', 'u2', w.submitted[0]!.text)).toBe('why?\n📎 1 annotation')
    expect(await drawRow($, w, 'UserMessage', 'u2', w.submitted[0]!.text, { isExpanded: true })).toBe(w.submitted[0]!.text)

    // The list is empty afterwards: the next prompt goes as typed.
    await submit($, 'plain')
    expect(w.submitted[1]).toEqual({ text: 'plain', context: undefined })
  })

  test('the original is kept in the store', async ($, on) => {
    const w = await start($, on)
    w.selection = { text: 'npm test', requestId: 'r1' }
    await runCommand($, w)
    await submit($, 'why?')
    expect(w.store.originals).toEqual({ [hashText(w.submitted[0]!.text)]: { text: 'why?', count: 1 } })
  })

  test('a resumed session draws the original from the store', async ($, on) => {
    const rewritten = '# Response annotations:\n...\n## My request:\nwhy?'
    const w = await start($, on, { originals: { [hashText(rewritten)]: { text: 'why?', count: 2 } } })
    expect(await drawRow($, w, 'UserMessage', 'u1', rewritten)).toBe('why?\n📎 2 annotations')
  })

  test('a template without {{request}} goes into context', { options: { templatePath: '~/xml.tmpl' } }, async ($, on) => {
    const w = await start($, on)
    w.files['/home/me/xml.tmpl'] = XML_TEMPLATE
    w.selection = { text: 'npm test', requestId: 'r1' }
    await runCommand($, w)
    await submit($, 'why?')
    expect(w.submitted[0]!.text).toBe('why?')
    expect(w.submitted[0]!.context).toEqual([
      'The user selected these excerpts from earlier in the conversation; their prompt refers to them by number.\n<annotation n="1" source="transcript">\n<excerpt>npm test</excerpt>\n\n</annotation>\n',
    ])
  })

  test('prompts not typed by the person are left alone', async ($, on) => {
    const w = await start($, on)
    w.selection = { text: 'npm test', requestId: 'r1' }
    await runCommand($, w)
    await $.prompt.submit({ text: 'done', origin: { kind: 'task-notification' }, wait: false })
    expect(w.submitted[0]!.text).toBe('done')
  })

  test('a missing template file says so and falls back to the default', { options: { templatePath: '/nope/missing.tmpl' } }, async ($, on) => {
    const w = await start($, on)
    w.selection = { text: 'npm test', requestId: 'r1' }
    await runCommand($, w)
    await submit($, 'why?')
    expect(w.toasts.at(-1)).toMatch(/cannot read \/nope\/missing.tmpl/)
    expect(w.submitted[0]!.text).toStartWith('# Response annotations:')
  })

  for (const kind of ['bridge', 'sdk', 'task-notification', 'peer', 'channel', 'scheduled-trigger'] as const) {
    test(`a ${kind} prompt is left alone and keeps the Annotations for the person's own`, async ($, on) => {
      const w = await start($, on)
      w.selection = { text: 'npm test', requestId: 'r1' }
      await runCommand($, w)
      await $.prompt.submit({ text: 'from elsewhere', origin: { kind }, wait: false } as never)
      expect(w.submitted[0]).toEqual({ text: 'from elsewhere', context: undefined })
      await submit($, 'mine')
      expect(w.submitted[1]!.text).toContain('"text": "npm test"')
    })
  }

  test('a prompt another plugin drops keeps the Annotations', async ($, on) => {
    const w = await start($, on)
    w.dropWhen = text => text.includes('DROP')
    w.selection = { text: 'npm test', requestId: 'r1' }
    await runCommand($, w)
    const dropped = await submit($, 'DROP me')
    expect(dropped).toEqual({ drop: 'refused' })
    const ui = await $.ui.mount({ plugin: 'add-to-chat', surface: 'terminal', ...BAND })
    expect((await ui.find({ key: 'list' }))?.text).toContain('1 annotation')
  })

  test('text that looks like template tags is sent as written', async ($, on) => {
    const w = await start($, on)
    w.selection = { text: 'use {{request}} and {{#annotations}}x{{/annotations}}', requestId: 'r1' }
    await runCommand($, w)
    await ui_comment($, w, 1, 'a "quoted" comment\twith <tags> & {{count}}')
    await submit($, 'why?')
    const json = JSON.parse(w.submitted[0]!.text.split('<response-annotations>\n')[1]!.split('\n</response-annotations>')[0]!)
    expect(json[0]).toEqual({
      text: 'use {{request}} and {{#annotations}}x{{/annotations}}',
      source: { role: 'transcript', rowId: 'r1' },
      comment: 'a "quoted" comment\twith <tags> & {{count}}',
    })
  })

  test('past fifty Annotations the number is written out', async ($, on) => {
    const w = await start($, on)
    for (let i = 1; i <= 52; i += 1) {
      w.selection = { text: `excerpt ${i}`, requestId: 'r1' }
      await runCommand($, w)
    }
    const ui = await $.ui.mount({ plugin: 'add-to-chat', surface: 'terminal', ...BAND, props: { ...BAND.props, maxRows: 60 } })
    await ui.press({ key: 'list' })
    expect(await listRow(ui, 50)).toContain('㊿')
    expect(await listRow(ui, 52)).toContain('(52)')
  })

  for (const surface of SURFACES) {
    test(`with an empty draft, Send fills the prompt (${surface})`, async ($, on) => {
      const w = await start($, on)
      w.selection = { text: 'npm test', requestId: 'r1' }
      await runCommand($, w)
      await tick(w)
      const ui = await $.ui.mount({ plugin: 'add-to-chat', surface, ...BAND })
      await ui.press({ key: 'send' })
      expect(w.fills).toEqual(['(see annotations)'])
      await tick(w)
      expect(await ui.find({ key: 'send' })).toBeUndefined()
    })
  }
})
