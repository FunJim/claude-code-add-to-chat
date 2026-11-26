// The pure modules on their own: what register.tsx decides with.
import { describe, expect, test } from 'claude-code/testing'

import type { Annotation } from '../types'
import { marksFor } from '../hooks/annotations'
import { shownTab } from '../hooks/pane'
import { promptRowView, replyText } from '../hooks/rows'
import { excerptOf, judge, noteOf, rowSource, selectionKey } from '../hooks/selection'
import type { Surroundings } from '../hooks/selection'
import { ownWords } from '../hooks/pane'
import { countRowFit, lineWords, offerFit } from '../hooks/prompt-hint'
import { width } from '../hooks/text'
import { annotated } from '../hooks/send'
import { renderTemplate } from '../hooks/template'
import { promptsIn, replyCountsOf, sameRecord, sentPrompts } from '../hooks/history'
import { turnReplies } from '../hooks/answering'
import { hashText } from '../hooks/hash'
import { isClipLineHead } from '../hooks/labels'

const A: Annotation[] = [
  { index: 1, text: 'one', source: 'assistant', requestId: 'r1' },
  { index: 2, text: 'two', source: 'user', requestId: 'u1', comment: 'hm' },
  { index: 3, text: 'three', source: 'transcript' },
]
const QUIET: Surroundings = { draft: '', pending: [], handled: null, outside: null, paneWords: [], footer: lineWords('(shift+tab to cycle) · ← for agents') }
/** The pane showing the list above, as its own words say it. */
const SHOWN: Surroundings = { ...QUIET, pending: A, paneWords: ownWords({ mode: { kind: 'pending' }, pending: A, sent: [] }) }

describe("the pane's own words", () => {
  const mode = { kind: 'pending' } as const
  test('the pending view: its tabs, sources, the Comment field, Send, the history row with its arrow', () => {
    const words = ownWords({ mode, pending: A, sent: [] })
    expect(words).toContain('2: You ✕')
    expect(words).toContain('added as ②')
    expect(words).toContain('② from your prompt')
    expect(words).toContain('two')
    expect(words).toContain('Comment: hm')
    expect(words).toContain('Comment: Add an optional comment… ⏎ save')
    expect(words).toContain('[ Send ] now, or type a prompt and press ↵')
    expect(words).toContain('History (0) ›')
  })
  test('the history view: its rows, beside the pending view own words', () => {
    const sent = [{ hash: 'h', text: 'q', annotations: A }]
    const words = ownWords({ mode: { kind: 'history' }, pending: A, sent })
    expect(words).toContain('← back')
    expect(words).toContain('Sent with annotations')
    expect(words).toContain('q')
    expect(words).toContain('📎 3 annotations')
    expect(words).toContain('2: You ✕')
  })
  test('the sent view: the prompt, its Annotations, the jump with its arrow', () => {
    const sent = [{ hash: 'h', text: 'q', annotations: A }]
    const words = ownWords({ mode: { kind: 'sent', hash: 'h', tab: 1 }, pending: A, sent })
    expect(words).toContain('↑ jump to prompt')
    expect(words).toContain('You')
    expect(words).toContain('① from Claude\'s reply')
    expect(words).toContain('one')
    expect(words).toContain('Comment: hm')
  })
})

describe('judging a selection', () => {
  test('an Excerpt in a row is offered', () => {
    expect(judge({ text: ' npm test ', requestId: 'r1' }, QUIET)).toEqual({ excerpt: { text: 'npm test', requestId: 'r1' }, key: selectionKey({ text: ' npm test ', requestId: 'r1' }) })
  })
  test('nothing selected, or only marks', () => {
    expect(judge(undefined, QUIET)).toEqual({ reason: 'nothing' })
    expect(judge({ text: '⁽¹⁾ ②', requestId: 'r1' }, QUIET)).toEqual({ reason: 'nothing' })
  })
  test('one pending in the same row (as which Annotation), or the last handled selection (added, or its offer dismissed)', () => {
    expect(judge({ text: 'one', requestId: 'r1' }, SHOWN)).toEqual({ reason: 'pending', text: 'one', index: 1 })
    expect(judge({ text: 'x', requestId: 'r1' }, { ...QUIET, handled: selectionKey({ text: 'x', requestId: 'r1' }) })).toEqual({ reason: 'handled' })
    expect(judge({ text: 'one', requestId: 'r2' }, SHOWN)).toHaveProperty('key')
  })
  test('what the first row says of a selection not offered: added as ①; nothing else', () => {
    expect(noteOf({ reason: 'pending', text: 'one', index: 1 })).toEqual({ text: 'one', index: 1 })
    expect(noteOf({ reason: 'handled' })).toBeNull()
    expect(noteOf({ reason: 'nothing' })).toBeNull()
    expect(noteOf({ excerpt: { text: 'x' }, key: 'x' })).toBeNull()
  })
  test("the draft's and the pane's own words", () => {
    expect(judge({ text: 'my draft' }, { ...QUIET, draft: 'this is my draft' })).toEqual({ reason: 'outside' })
    expect(judge({ text: '2: You ✕' }, SHOWN)).toEqual({ reason: 'outside' })
    expect(judge({ text: '② from your' }, SHOWN)).toEqual({ reason: 'outside' })
    expect(judge({ text: '│ one │\n╰───╯' }, SHOWN)).toEqual({ reason: 'outside' })
    expect(judge({ text: 'Comment: hm' }, SHOWN)).toEqual({ reason: 'outside' })
    expect(judge({ text: 'added as ②' }, SHOWN)).toEqual({ reason: 'outside' })
    expect(judge({ text: 'my draft', requestId: 'r1' }, { ...QUIET, draft: 'this is my draft' })).toEqual({ excerpt: { text: 'my draft', requestId: 'r1' }, key: selectionKey({ text: 'my draft', requestId: 'r1' }) })
  })
  test('a drag from the prompt box down onto the line under it, or along that line, is not offered', () => {
    const rule = '─'.repeat(60)
    const draft = { ...QUIET, draft: 'DRAFT-WORDS in my own prompt' }
    // Down from the draft, over the box's rule, onto the hint and the offer floated there.
    expect(judge({ text: `AFT-WORDS in my own prompt\n${rule}\n\n  ⏵⏵ bypass permissions on (shift+tab to cycle) · ← for agents\n` }, draft)).toEqual({ reason: 'outside' })
    expect(judge({ text: `${rule}\n\n  ⏵⏵ bypass permissions on (shift+tab` }, draft)).toEqual({ reason: 'outside' })
    // Along the hint's row, the offer drawn at its end.
    expect(judge({ text: '⏵⏵ bypass permissions on (shift+tab to cycle) · ← for agents        [ ✚ Add to chat ] “Ran the” ✕' }, QUIET)).toEqual({ reason: 'outside' })
    expect(judge({ text: '[ ✚ Add to' }, QUIET)).toEqual({ reason: 'outside' })
  })
  test('with Annotations pending the offer goes on the count row, after the count, where it fits', () => {
    const label = '📎 1 annotation · show pane'
    expect(countRowFit(131, label, 'running or done')).toEqual({ preview: 'running or done' })
    expect(countRowFit(131, label, 'x'.repeat(200))?.preview).toMatch(/…$/)
    // Room for the button and the ✕ alone; then none, and the hint's row takes it.
    const bare = 2 + width(label) + 3 + width('[ ✚ Add to chat ] ✕') + 1
    expect(countRowFit(bare, label, 'running or done')).toEqual({ preview: null })
    expect(countRowFit(bare - 1, label, 'running or done')).toBeNull()
  })
  test("a selection once outside the transcript stays outside while the engine reports it, its text the draft's no more", () => {
    const once = { ...QUIET, draft: 'DRAFT-TEXT her in the prompt box', outside: selectionKey({ text: 'DRAFT-TEXT here' }) }
    expect(judge({ text: 'DRAFT-TEXT here' }, once)).toEqual({ reason: 'outside' })
    // The same text in a row is another selection.
    expect(judge({ text: 'DRAFT-TEXT here', requestId: 'r1' }, once)).toHaveProperty('excerpt')
  })
  test('transcript text across rows is still offered, a rule among it or not', () => {
    expect(judge({ text: 'Ran the subagent\n2. Read th' }, QUIET)).toHaveProperty('excerpt')
    expect(judge({ text: `the first part\n${'─'.repeat(40)}\nthe second part` }, QUIET)).toHaveProperty('excerpt')
    // The hint's words in a reply are a reply's, in its row.
    expect(judge({ text: 'press (shift+tab to cycle) · ← for agents', requestId: 'r1' }, QUIET)).toHaveProperty('excerpt')
  })
  test("the offer goes beside the hint at the line's right end, or in its place where it does not fit; never on a row of its own", () => {
    const hint = '(shift+tab to cycle) · ← for agents'
    const wide = offerFit(131, hint, 'Ran the')
    expect(wide).toEqual({ at: 'beside', preview: 'Ran the', left: 99 })
    // Its last cell, the ✕, one in from the right end (the row counts from its indent, two in).
    expect(2 + (wide as { left: number }).left + width('[ ✚ Add to chat ] “Ran the” ✕')).toBe(130)
    expect(offerFit(131, hint, 'x'.repeat(200)).preview).toMatch(/…$/)
    expect(offerFit(79, hint, 'Ran the')).toEqual({ at: 'instead', preview: 'Ran the' })
    // Just room for the button and the ✕: no preview.
    const tight = 2 + 26 + 3 + width(hint) + 1 + width('[ ✚ Add to chat ] ✕')
    expect(offerFit(tight, hint, 'Ran the')).toEqual({ at: 'beside', preview: null, left: tight - 2 - 1 - width('[ ✚ Add to chat ] ✕') })
  })
  test('rowSource: replies, typed prompts, tool rows, and Claude Code\'s own', () => {
    expect(rowSource('AssistantMessage', {})).toBe('assistant')
    expect(rowSource('UserMessage', { origin: { kind: 'composer' } })).toBe('user')
    expect(rowSource('UserMessage', { origin: { kind: 'bridge' } })).toBe('user')
    expect(rowSource('UserMessage', { origin: { kind: 'task-notification' } })).toBe('system')
    expect(['ToolUse', 'ToolResult', 'ToolGroup'].map(c => rowSource(c, {}))).toEqual(['tool', 'tool', 'tool'])
    expect(['TurnDuration', 'CommandOutput'].map(c => rowSource(c, {}))).toEqual(['system', 'system'])
    expect(rowSource('Pane', {})).toBe('transcript')
  })
  test('excerptOf drops the 📎 line and any head of it', () => {
    expect(excerptOf({ text: 'q\n📎 3 annotations' })).toEqual({ text: 'q' })
    expect(excerptOf({ text: 'q\n  📎 3 ann' })).toEqual({ text: 'q' })
  })
  test('selectionKey tells row and text apart, with no control characters', () => {
    const keys = [
      selectionKey({ text: 'b', requestId: 'a' }),
      selectionKey({ text: 'b' }),
      selectionKey({ text: 'ab' }),
      selectionKey({ text: '', requestId: 'ab' }),
    ]
    expect(new Set(keys).size).toBe(keys.length)
    for (const k of keys) expect([...k].some(c => c.charCodeAt(0) < 32)).toBe(false)
    expect(selectionKey({ text: 'b', requestId: 'a' })).toBe(selectionKey({ text: 'b', requestId: 'a' }))
  })
})

describe('the list in rows and the pane', () => {
  test('the open tab is clamped to the list', () => {
    expect([shownTab(3, 2), shownTab(0, 2)]).toEqual([2, 1])
  })
  test('marksFor picks the row', () => {
    expect(marksFor(A, 'u1').map(a => a.index)).toEqual([2])
    expect(marksFor(A, undefined)).toEqual([])
  })
})

describe('rows and sending', () => {
  test('replyText draws Citations and marks', () => {
    expect(replyText('one :annotation{index="1"}', 'r1', A)).toBe('one`⁽¹⁾` `①`')
  })
  test("a sent prompt's row: text, or (in the terminal, Annotations kept) the 📎 row", () => {
    const found = { hash: 'h', original: { text: 'why?', count: 1, annotations: [A[1]!] } }
    const row = { text: '# Response…', requestId: 'u9', isExpanded: false, surface: 'terminal' }
    // No Original for it: the engine's text. ctrl+o expanded: the same.
    expect(promptRowView({ ...row, isExpanded: true }, found, A)).toEqual({ kind: 'text', text: '# Response…' })
    expect(promptRowView(row, undefined, A)).toEqual({ kind: 'text', text: '# Response…' })
    // Another surface, or kept without its Annotations: the Original, a `📎` line, no button.
    expect(promptRowView({ ...row, surface: 'desktop' }, found, A)).toEqual({ kind: 'text', text: 'why?\n📎 1 annotation' })
    expect(promptRowView(row, { hash: 'h', original: { text: 'why?', count: 1 } }, A)).toEqual({ kind: 'text', text: 'why?\n📎 1 annotation' })
    expect(promptRowView(row, found, [])).toEqual({ kind: 'wrapped', text: 'why?', hash: 'h', count: 1, annotations: [A[1]!] })
  })
  test('annotated rewrites the prompt by the template and keeps what was typed', () => {
    expect(annotated('q', A)).toEqual({ text: renderTemplate('q', A), original: { text: 'q', count: 3, annotations: A } })
  })
})

describe('sent prompts', () => {
  test("replyCountsOf: this conversation's reply rows → their prompt's count", () => {
    const originals = { a: { text: 'one', count: 2, replies: ['r1', 'r2'] }, b: { text: 'two', count: 1 }, c: { text: 'elsewhere', count: 5, replies: ['r9'] } }
    expect(replyCountsOf(originals, ['a', 'b'])).toEqual({ r1: 2, r2: 2 })
    expect([sameRecord({ r1: 2 }, { r1: 2 }), sameRecord({ r1: 2 }, { r1: 3 }), sameRecord({}, { r1: 2 })]).toEqual([true, false, false])
  })
  test('sentPrompts: the conversation\'s, newest first, only those with Annotations kept', () => {
    const one = { index: 1, text: 't', source: 'user' as const }
    const originals = { a: { text: 'old', count: 1, annotations: [one] }, b: { text: 'unkept', count: 2 }, c: { text: 'new', count: 1, annotations: [one] }, d: { text: 'elsewhere', count: 1, annotations: [one] } }
    expect(sentPrompts(originals, ['a', 'b', 'c']).map(p => p.text)).toEqual(['new', 'old'])
  })
  test('turnReplies: the noted rows said after the prompt; all of them when it is not in the transcript', () => {
    const messages = [
      { role: 'assistant', text: 'old   words' },
      { role: 'user', text: 'P' },
      { role: 'assistant', text: 'first\n\nsecond part' },
      { role: 'user', text: '' },
      { role: 'assistant', text: 'third' },
    ]
    const noted = [
      { id: 'o', text: 'old words' },
      { id: 'a', text: 'second  part' },
      { id: 'b', text: 'third' },
    ]
    expect(turnReplies(messages, hashText('P'), noted)).toEqual(['a', 'b'])
    // Not past the next prompt.
    expect(turnReplies([...messages, { role: 'user', text: 'next' }, { role: 'assistant', text: 'fourth' }], hashText('P'), [...noted, { id: 'c', text: 'fourth' }])).toEqual(['a', 'b'])
    expect(turnReplies(messages, hashText('missing'), noted)).toEqual(['o', 'a', 'b'])
  })
  test('promptsIn: the user messages that are rewritten prompts, oldest first, each once', () => {
    const originals = { [hashText('R1')]: { text: 'one', count: 1 }, [hashText('R2')]: { text: 'two', count: 1 } }
    const messages = [
      { role: 'user', text: 'R2' },
      { role: 'assistant', text: 'R1' },
      { role: 'user', text: 'plain' },
      { role: 'user', text: 'R1' },
      { role: 'user', text: 'R2' },
    ]
    expect(promptsIn(messages, originals)).toEqual([hashText('R2'), hashText('R1')])
  })
  test("the 📎 button's line is a clip line, arrow and all", () => {
    expect(isClipLineHead('📎 2 annotations ↗')).toBe(true)
    expect(isClipLineHead('  📎 2 annotations')).toBe(true)
  })
})

