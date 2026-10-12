import { describe, expect, test } from 'claude-code/testing'

import { hashText } from '../hooks/hash'
import { BAND, XML_TEMPLATE, drawRow, runCommand, start, submit, tick } from './world'

const SURFACES = ['terminal', 'desktop'] as const
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
      expect((await ui.find({ type: 'Text', text: /① Claude: "npm test before you commit"/ }))).toBeDefined()
      expect((await ui.find({ type: 'Text', text: /is this needed\?/ }))).toBeDefined()

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
    expect(await ui.find({ type: 'Text', text: /① You: "earlier idea"/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /② Transcript: "Bash\(ls\) a.txt"/ })).toBeDefined()
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
    expect(await ui.find({ type: 'Text', text: /① Transcript: "second"/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /② Transcript: "third"/ })).toBeDefined()
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

  test('an Excerpt not found in the markdown is marked at the head of the row', async ($, on) => {
    const w = await start($, on)
    await drawRow($, w, 'AssistantMessage', 'r1', 'Some reply text.')
    w.selection = { text: 'text the markdown never had', requestId: 'r1' }
    await runCommand($, w)
    expect(await drawRow($, w, 'AssistantMessage', 'r1', 'Some reply text.')).toBe('`①` Some reply text.')
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
