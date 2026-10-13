import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { hashText } from '../hooks/hash'
import { XML_TEMPLATE, addText, drawBand, drawRow, mountPane, runCommand, start, submit, tick } from './world'

const SURFACES = ['terminal', 'desktop'] as const

type Mounted = Awaited<ReturnType<typeof mountPane<'terminal'>>>

/** Sends a prompt and resolves the annotations JSON the model was given. */
async function submitted($: Engine, w: Awaited<ReturnType<typeof start>>): Promise<{ text: string; source: { role: string }; annotation?: string }[]> {
  await submit($, 'q')
  return JSON.parse(w.submitted.at(-1)!.text.split('<response-annotations>\n')[1]!.split('\n</response-annotations>')[0]!)
}

/** Everything a mounted pane shows, with tab `index` open (the current one if omitted). */
async function shown(pane: Mounted, index?: number): Promise<string> {
  if (index !== undefined) await pane.press({ key: `show-${index}` })
  const buttons = (await pane.findAll({ type: 'Button' })).map(b => b.text).join(' ')
  const text = (await pane.findAll({ type: 'Text' })).map(t => t.text).join('\n')
  return `${buttons}\n${text}`
}

/** Everything the pane shows, mounted for the look. */
async function paneText($: Engine, index?: number): Promise<string> {
  const pane = await mountPane($)
  const text = await shown(pane, index)
  await pane.unmount()
  return text
}

/** How many tabs a mounted pane has: the pending Annotations. */
async function tabsOf(pane: Mounted): Promise<number> {
  return (await pane.findAll({ type: 'Button' })).filter(b => b.key?.startsWith('show-')).length
}

/** How many tabs the pane has, mounted for the count. */
async function tabCount($: Engine): Promise<number> {
  const pane = await mountPane($)
  const tabs = await tabsOf(pane)
  await pane.unmount()
  return tabs
}

/** Writes a Comment in the pane's field for Annotation `index`. */
async function commentInPane($: Engine, index: number, text: string) {
  const pane = await mountPane($)
  await pane.press({ key: `show-${index}` })
  await pane.input({ key: `comment-${index}`, text })
  await pane.unmount()
}

const REPLY = 'Run `npm test` before you **commit the change**.'

describe('the pane', () => {
  for (const surface of SURFACES) {
    test(`a hint, then the offer, then Add to chat makes a tab (${surface})`, async ($, on) => {
      const w = await start($, on)
      await drawRow($, w, 'AssistantMessage', 'r1', REPLY)
      const pane = await mountPane($, surface)
      expect(await pane.find({ key: 'add' })).toBeUndefined()
      expect(await pane.find({ type: 'Text', text: /Select text in the transcript/ })).toBeDefined()

      w.selection = { text: 'npm test before you commit', requestId: 'r1' }
      await tick(w)
      expect(await pane.find({ type: 'Text', text: /npm test before you commit/ })).toBeDefined()

      await pane.press({ key: 'add' })
      expect(await pane.find({ key: 'add' })).toBeUndefined()
      expect(await pane.find({ key: 'show-1' })).toBeDefined()
      const text = (await pane.findAll({ type: 'Text' })).map(t => t.text).join('\n')
      expect(text).toContain('“npm test before you commit”')
      expect(text).toContain("from Claude's reply")
      expect(w.status.at(-1)).toBe('📎 1 annotation')

      await pane.input({ key: 'comment-1', text: 'is this needed?' })
      expect((await submitted($, w))[0]!.annotation).toBe('is this needed?')
      expect(w.status.at(-1)).toBeUndefined()

      // The same selection keeps being returned; it is not offered again.
      await tick(w)
      expect(await pane.find({ key: 'add' })).toBeUndefined()
      await pane.unmount()
    })
  }

  test('the offer keeps to one row, cut to the pane\'s width', async ($, on) => {
    const w = await start($, on)
    w.selection = { text: 'a phrase long enough to need far more room than a narrow pane has to give it', requestId: 'r1' }
    await tick(w)
    const pane = await mountPane($, 'terminal', 36)
    const offer = (await pane.find({ key: 'offer' }))?.text ?? ''
    expect(offer).toContain('…”')
    expect(offer).toContain('✕')
    expect(offer).not.toContain('ignore')
  })

  test('one tab per Annotation, the last added open; closing a tab removes it and renumbers the rest', async ($, on) => {
    const w = await start($, on)
    await drawRow($, w, 'UserMessage', 'u1', 'my earlier idea about caching')
    await addText($, w, 'a long excerpt that the pane shows whole, every word of it, never cut', 'r1')
    await addText($, w, 'earlier idea', 'u1')
    await addText($, w, 'third', 'r1')
    const pane = await mountPane($)
    expect(await shown(pane)).toContain('“third”')
    const first = await shown(pane, 1)
    expect(first).toContain('every word of it, never cut”')
    expect(first).toContain('① Transcript')
    expect(await shown(pane, 2)).toContain('from your prompt')
    await pane.press({ key: 'close-1' })
    expect(await shown(pane, 1)).toContain('“earlier idea”')
    expect(await shown(pane, 2)).toContain('“third”')
    expect(await pane.find({ key: 'show-3' })).toBeUndefined()
    expect(w.status.at(-1)).toBe('📎 2 annotations')
  })

  test('the pane stays open with nothing pending, and says so', async ($, on) => {
    const w = await start($, on)
    await addText($, w, 'one', 'r1')
    const pane = await mountPane($)
    await pane.press({ key: 'close-1' })
    expect(await shown(pane)).toContain('Nothing added yet.')
    expect(w.status.at(-1)).toBeUndefined()
  })

  test('the band\'s first fullscreen drawing opens the pane; the main screen does not', async ($, on) => {
    const w = await start($, on)
    await drawBand($, false)
    expect(w.panes.has('add-to-chat')).toBe(false)
    await drawBand($)
    expect(w.panes.has('add-to-chat')).toBe(true)
    // The band itself is Claude Code's: add-to-chat draws nothing there.
    expect(w.drawnProps.band).toBeDefined()
  })

  test('/add-to-chat opens the pane, and adds the selection when there is one', async ($, on) => {
    const w = await start($, on)
    await runCommand($, w)
    expect(w.panes.has('add-to-chat')).toBe(true)
    expect(w.toasts).toEqual([])
    await addText($, w, 'npm test', 'r1')
    expect(w.toasts.at(-1)).toMatch(/Added ①/)
  })

  test('/add-to-chat outside fullscreen says fullscreen is needed and opens nothing', async ($, on) => {
    const w = await start($, on)
    w.isFullscreen = false
    const ran = await runCommand($, w)
    expect(ran.text).toBeUndefined()
    expect(w.toasts.at(-1)).toMatch(/fullscreen/)
    expect(w.panes.has('add-to-chat')).toBe(false)
  })

  for (const surface of SURFACES) {
    test(`with an empty draft, Send fills the prompt (${surface})`, async ($, on) => {
      const w = await start($, on)
      await addText($, w, 'npm test', 'r1')
      await tick(w)
      const pane = await mountPane($, surface)
      await pane.press({ key: 'send' })
      expect(w.fills).toEqual(['(see annotations)'])
      await tick(w)
      expect(await pane.find({ key: 'send' })).toBeUndefined()
    })
  }

  test('ignoring a selection takes the offer away until another selection', async ($, on) => {
    const w = await start($, on)
    const pane = await mountPane($)
    w.selection = { text: 'not this', requestId: 'r1' }
    await tick(w)
    await pane.press({ key: 'ignore' })
    await tick(w)
    expect(await pane.find({ key: 'add' })).toBeUndefined()
    w.selection = { text: 'this one', requestId: 'r1' }
    await tick(w)
    expect(await pane.find({ key: 'add' })).toBeDefined()
  })
})

describe('adding a selection', () => {
  test('a prompt row is Source user, a tool row tool, a notification system; outside any row, transcript', async ($, on) => {
    const w = await start($, on)
    await drawRow($, w, 'UserMessage', 'u1', 'my earlier idea about caching')
    await drawRow($, w, 'UserMessage', 'n1', 'Background command finished', { origin: { kind: 'task-notification' } })
    await $.ui.render({ component: 'ToolUse', requestId: 'toolu_1', surface: 'terminal', props: {} } as never)
    await addText($, w, 'earlier idea', 'u1')
    await addText($, w, 'Bash(ls)', 'toolu_1')
    await addText($, w, 'command finished', 'n1')
    await addText($, w, 'Bash(ls)\n  a.txt')
    expect((await submitted($, w)).map(a => a.source.role)).toEqual(['user', 'tool', 'system', 'transcript'])
  })

  test('an Excerpt already pending is not offered or added again', async ($, on) => {
    const w = await start($, on)
    await addText($, w, 'npm test', 'r1')
    await addText($, w, 'something else', 'r1')
    w.selection = { text: 'npm test', requestId: 'r1' }
    await tick(w)
    const pane = await mountPane($)
    expect(await pane.find({ key: 'add' })).toBeUndefined()
    await runCommand($, w)
    expect(w.toasts.at(-1)).toMatch(/already added/)
    expect(await tabsOf(pane)).toBe(2)
    // The same words in another row are another Excerpt.
    w.selection = { text: 'npm test', requestId: 'r2' }
    await tick(w)
    expect(await pane.find({ key: 'add' })).toBeDefined()
  })

  describe('selections that are not transcript text are not offered', () => {
    test('the 📎 line under a rewritten prompt', async ($, on) => {
      const w = await start($, on)
      await addText($, w, '📎 2 annotations', 'u1')
      await addText($, w, '📎 2 annot', 'u1')
      expect(await tabCount($)).toBe(0)
      w.selection = { text: 'my question\n  📎', requestId: 'u1' }
      await tick(w)
      const pane = await mountPane($)
      expect(await pane.find({ type: 'Text', text: '“my question”' })).toBeDefined()
      await runCommand($, w)
      expect(await shown(pane)).toContain('“my question”')
    })

    test('the draft in the prompt box', async ($, on) => {
      const w = await start($, on)
      w.draft = 'DRAFT-TEXT here in the prompt box'
      w.selection = { text: 'DRAFT-TEXT here' }
      await tick(w)
      const pane = await mountPane($)
      expect(await pane.find({ key: 'add' })).toBeUndefined()
      await runCommand($, w)
      expect(await tabsOf(pane)).toBe(0)
    })

    test("the pane's own words", async ($, on) => {
      const w = await start($, on)
      await addText($, w, 'npm test', 'r1')
      await commentInPane($, 1, 'why?')
      for (const text of ['Select text in the transcript', '① Transcript ✕', 'from the transcript', '“npm test”', 'Comment: why?', 'Nothing to type?', 'They go with your next prompt']) {
        await addText($, w, text)
      }
      expect(await tabCount($)).toBe(1)
    })

    test('a selection spanning rows that is not pane text is still offered, and stays offered', async ($, on) => {
      const w = await start($, on)
      w.draft = 'unrelated draft'
      w.selection = { text: 'end of one reply\n\nstart of the next' }
      await tick(w)
      const pane = await mountPane($)
      expect(await pane.find({ key: 'add' })).toBeDefined()
      // Its preview in the pane is not pane text that hides it again.
      await tick(w)
      expect(await pane.find({ key: 'add' })).toBeDefined()
    })
  })

  test('/clear drops pending Annotations', async ($, on) => {
    const w = await start($, on)
    await addText($, w, 'npm test', 'r1')
    await $.session.end({ reason: 'clear', sessionId: 's1' } as never)
    await submit($, 'fresh start')
    expect(w.submitted[0]).toEqual({ text: 'fresh start', context: undefined })
  })
})

describe('marks in the transcript', () => {
  test('a pending Annotation is marked after its Excerpt; cleared after submit', async ($, on) => {
    const w = await start($, on)
    await drawRow($, w, 'AssistantMessage', 'r1', REPLY)
    await addText($, w, 'commit the change', 'r1')
    expect(await drawRow($, w, 'AssistantMessage', 'r1', REPLY)).toBe('Run `npm test` before you **commit the change**`⁽¹⁾`.')
    expect(await drawRow($, w, 'AssistantMessage', 'r2', REPLY)).toBe(REPLY)
    await submit($, 'go')
    expect(await drawRow($, w, 'AssistantMessage', 'r1', REPLY)).toBe(REPLY)
  })

  test('ctrl+o draws marks on the full prompt the model read', async ($, on) => {
    const w = await start($, on)
    await drawRow($, w, 'UserMessage', 'u1', 'please refactor the parser')
    await addText($, w, 'refactor', 'u1')
    expect(await drawRow($, w, 'UserMessage', 'u1', 'please refactor the parser', { isExpanded: true })).toBe(
      'please refactor`⁽¹⁾` the parser',
    )
  })

  test('an Excerpt not found in the markdown is marked at the head of the row', async ($, on) => {
    const w = await start($, on)
    await drawRow($, w, 'AssistantMessage', 'r1', 'Some reply text.')
    await addText($, w, 'text the markdown never had', 'r1')
    expect(await drawRow($, w, 'AssistantMessage', 'r1', 'Some reply text.')).toBe('`①` Some reply text.')
  })

  test('a background-task notification row is not one of your prompts', async ($, on) => {
    const w = await start($, on)
    await drawRow($, w, 'UserMessage', 'n1', 'Background command "sleep" completed', {
      origin: { kind: 'task-notification' },
      task: { id: 't1', status: 'completed' },
    })
    await addText($, w, 'Background command', 'n1')
    await submit($, 'what finished?')
    expect(w.submitted[0]!.text).toContain('"role":"system"')
    // Its row is drawn as the engine has it: no mark, no rewrite.
    expect(
      await drawRow($, w, 'UserMessage', 'n1', 'Background command "sleep" completed', { origin: { kind: 'task-notification' } }),
    ).toBe('Background command "sleep" completed')
  })

  test('a summary block keeps its isSummary when marked', async ($, on) => {
    const w = await start($, on)
    await drawRow($, w, 'AssistantMessage', 's1', 'Checked the parser and the lexer.', { isSummary: true })
    await addText($, w, 'the lexer', 's1')
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
    await addText($, w, 'npm test', 'r1')
    const entered = await submit($, 'why?')
    expect(w.submitted).toHaveLength(1)
    expect(w.submitted[0]!.text).toStartWith('# Response annotations:')
    expect(w.submitted[0]!.text).toContain('"text":"npm test"')
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
    await addText($, w, 'npm test', 'r1')
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
    await addText($, w, 'npm test', 'r1')
    await submit($, 'why?')
    expect(w.submitted[0]!.text).toBe('why?')
    expect(w.submitted[0]!.context).toEqual([
      'The user selected these excerpts from earlier in the conversation; their prompt refers to them by number.\n<annotation n="1" source="transcript">\n<excerpt>npm test</excerpt>\n\n</annotation>\n',
    ])
  })

  test('prompts not typed by the person are left alone', async ($, on) => {
    const w = await start($, on)
    await addText($, w, 'npm test', 'r1')
    await $.prompt.submit({ text: 'done', origin: { kind: 'task-notification' }, wait: false })
    expect(w.submitted[0]!.text).toBe('done')
  })

  test('a missing template file says so and falls back to the default', { options: { templatePath: '/nope/missing.tmpl' } }, async ($, on) => {
    const w = await start($, on)
    await addText($, w, 'npm test', 'r1')
    await submit($, 'why?')
    expect(w.toasts.at(-1)).toMatch(/cannot read \/nope\/missing.tmpl/)
    expect(w.submitted[0]!.text).toStartWith('# Response annotations:')
  })

  for (const kind of ['bridge', 'sdk', 'task-notification', 'peer', 'channel', 'scheduled-trigger'] as const) {
    test(`a ${kind} prompt is left alone and keeps the Annotations for the person's own`, async ($, on) => {
      const w = await start($, on)
      await addText($, w, 'npm test', 'r1')
      await $.prompt.submit({ text: 'from elsewhere', origin: { kind }, wait: false } as never)
      expect(w.submitted[0]).toEqual({ text: 'from elsewhere', context: undefined })
      await submit($, 'mine')
      expect(w.submitted[1]!.text).toContain('"text":"npm test"')
    })
  }

  test('a prompt another plugin drops keeps the Annotations', async ($, on) => {
    const w = await start($, on)
    w.dropWhen = text => text.includes('DROP')
    await addText($, w, 'npm test', 'r1')
    const dropped = await submit($, 'DROP me')
    expect(dropped).toEqual({ drop: 'refused' })
    expect(await tabCount($)).toBe(1)
  })

  test('text that looks like template tags is sent as written', async ($, on) => {
    const w = await start($, on)
    await addText($, w, 'use {{request}} and {{#annotations}}x{{/annotations}}', 'r1')
    await commentInPane($, 1, 'a "quoted" comment\twith <tags> & {{count}}')
    await submit($, 'why?')
    const json = JSON.parse(w.submitted[0]!.text.split('<response-annotations>\n')[1]!.split('\n</response-annotations>')[0]!)
    expect(json[0]).toEqual({
      text: 'use {{request}} and {{#annotations}}x{{/annotations}}',
      source: { role: 'transcript', requestId: 'r1' },
      annotation: 'a "quoted" comment\twith <tags> & {{count}}',
    })
  })

  test('past fifty Annotations the number is written out', async ($, on) => {
    const w = await start($, on)
    for (let i = 1; i <= 52; i += 1) {
      await addText($, w, `excerpt ${i}`, 'r1')
    }
    expect(await paneText($, 50)).toContain('㊿ Transcript')
    expect(await paneText($, 52)).toContain('(52) Transcript')
  })

})
