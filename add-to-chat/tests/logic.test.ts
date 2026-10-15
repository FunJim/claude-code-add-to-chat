// The pure modules on their own: what register.tsx decides with.
import { describe, expect, test } from 'claude-code/testing'

import type { Annotation } from '../types'
import { appended, marksFor, withComment, without } from '../hooks/annotations'
import { shownTab, tabAfterRemoving } from '../hooks/pane'
import { promptText, replyText } from '../hooks/rows'
import { excerptOf, judge, noteOf, rowSource } from '../hooks/selection'
import type { Surroundings } from '../hooks/selection'
import { annotated, withOriginal } from '../hooks/send'
import { promptsIn, replyCountsOf, sameRecord, sentPrompts, turnReplies, withReplies } from '../hooks/history'
import { hashText } from '../hooks/hash'
import { isClipLineHead } from '../hooks/labels'

const A: Annotation[] = [
  { index: 1, text: 'one', source: 'assistant', requestId: 'r1' },
  { index: 2, text: 'two', source: 'user', requestId: 'u1', comment: 'hm' },
  { index: 3, text: 'three', source: 'transcript' },
]
const QUIET: Surroundings = { draft: '', pending: [], handled: null }

describe('judging a selection', () => {
  test('an Excerpt in a row is offered', () => {
    expect(judge({ text: ' npm test ', requestId: 'r1' }, QUIET)).toEqual({ excerpt: { text: 'npm test', requestId: 'r1' }, key: 'r1\u0000 npm test ' })
  })
  test('nothing selected, or only marks', () => {
    expect(judge(undefined, QUIET)).toEqual({ reason: 'nothing' })
    expect(judge({ text: '⁽¹⁾ ②', requestId: 'r1' }, QUIET)).toEqual({ reason: 'nothing' })
  })
  test('one pending in the same row (as which Annotation), or the last handled selection (added or ignored)', () => {
    expect(judge({ text: 'one', requestId: 'r1' }, { ...QUIET, pending: A })).toEqual({ reason: 'pending', text: 'one', index: 1 })
    expect(judge({ text: 'x', requestId: 'r1' }, { ...QUIET, handled: { key: 'r1\u0000x', isIgnored: true } })).toEqual({ reason: 'handled', text: 'x', isIgnored: true })
    expect(judge({ text: 'one', requestId: 'r2' }, { ...QUIET, pending: A })).toHaveProperty('key')
  })
  test('what the first row says of a selection not offered: added as ①, ignored; nothing else', () => {
    expect(noteOf({ reason: 'pending', text: 'one', index: 1 })).toEqual({ kind: 'added', text: 'one', index: 1 })
    expect(noteOf({ reason: 'handled', text: 'x', isIgnored: true })).toEqual({ kind: 'ignored', text: 'x' })
    expect(noteOf({ reason: 'handled', text: 'x', isIgnored: false })).toBeNull()
    expect(noteOf({ reason: 'nothing' })).toBeNull()
    expect(noteOf({ excerpt: { text: 'x' }, key: 'x' })).toBeNull()
  })
  test("the draft's and the pane's own words", () => {
    expect(judge({ text: 'my draft' }, { ...QUIET, draft: 'this is my draft' })).toEqual({ reason: 'nothing' })
    expect(judge({ text: '2: You ✕' }, { ...QUIET, pending: A })).toEqual({ reason: 'nothing' })
    expect(judge({ text: '② from your' }, { ...QUIET, pending: A })).toEqual({ reason: 'nothing' })
    expect(judge({ text: '│ one │\n╰───╯' }, { ...QUIET, pending: A })).toEqual({ reason: 'nothing' })
    expect(judge({ text: 'Comment: hm' }, { ...QUIET, pending: A })).toEqual({ reason: 'nothing' })
    expect(judge({ text: 'added as ②' }, { ...QUIET, pending: A })).toEqual({ reason: 'nothing' })
    expect(judge({ text: 'ignored · /add-to-chat' }, QUIET)).toEqual({ reason: 'nothing' })
    expect(judge({ text: 'my draft', requestId: 'r1' }, { ...QUIET, draft: 'this is my draft' })).toHaveProperty('excerpt')
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
})

describe('editing the list', () => {
  test('appended numbers from the list', () => {
    expect(appended(A, { text: 'four', requestId: 'r9' }, 'assistant').at(-1)).toEqual({ index: 4, text: 'four', source: 'assistant', requestId: 'r9' })
  })
  test('withComment trims, and an empty one removes it', () => {
    expect(withComment(A, 1, '  why? ')[0]!.comment).toBe('why?')
    expect(withComment(A, 2, '   ')[1]!.comment).toBeUndefined()
  })
  test('without renumbers', () => {
    expect(without(A, 1).map(a => [a.index, a.text])).toEqual([[1, 'two'], [2, 'three']])
  })
  test('the open tab follows a removal', () => {
    expect([tabAfterRemoving(3, 1), tabAfterRemoving(1, 1), tabAfterRemoving(1, 2), shownTab(3, 2), shownTab(0, 2)]).toEqual([2, 1, 1, 2, 1])
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
  test('promptText draws the original with its 📎 line', () => {
    expect(promptText('# Response…', 'u9', A, { text: 'why?', count: 2 })).toBe('why?\n📎 2 annotations')
  })
  test('annotated rewrites with {{request}}, adds context without', () => {
    expect(annotated('[{{request}}] {{count}}', 'q', undefined, A)).toEqual({ text: '[q] 3', context: undefined, original: { text: 'q', count: 3, annotations: A } })
    expect(annotated('{{count}} notes', 'q', ['c0'], A)).toEqual({ text: 'q', context: ['c0', '3 notes'] })
  })
  test('withOriginal keeps the newest', () => {
    const map = withOriginal({ a: { text: '1', count: 1 }, b: { text: '2', count: 1 } }, 'c', { text: '3', count: 1 }, 2)
    expect(Object.keys(map)).toEqual(['b', 'c'])
  })
})

describe('sent prompts', () => {
  test("replyCountsOf: this conversation's reply rows → their prompt's count", () => {
    const originals = { a: { text: 'one', count: 2, replies: ['r1', 'r2'] }, b: { text: 'two', count: 1 }, c: { text: 'elsewhere', count: 5, replies: ['r9'] } }
    expect(replyCountsOf(originals, ['a', 'b'])).toEqual({ r1: 2, r2: 2 })
    expect(withReplies(originals.a, ['r2', 'r3']).replies).toEqual(['r1', 'r2', 'r3'])
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

