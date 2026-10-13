// The pure modules on their own: what register.tsx decides with.
import { describe, expect, test } from 'claude-code/testing'

import type { Annotation } from '../types'
import { appended, commentingAfterRemoving, marksFor, withComment, without } from '../hooks/annotations'
import { promptText, replyText } from '../hooks/rows'
import { excerptOf, judge } from '../hooks/selection'
import type { Surroundings } from '../hooks/selection'
import { annotated, withOriginal } from '../hooks/send'

const A: Annotation[] = [
  { index: 1, text: 'one', source: 'claude', rowId: 'r1' },
  { index: 2, text: 'two', source: 'you', rowId: 'u1', comment: 'hm' },
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
  test('the last handled selection, or one pending in the same row', () => {
    expect(judge({ text: 'x', requestId: 'r1' }, { ...QUIET, handled: 'r1\u0000x' })).toEqual({ reason: 'already' })
    expect(judge({ text: 'one', requestId: 'r1' }, { ...QUIET, pending: A })).toEqual({ reason: 'already' })
    expect(judge({ text: 'one', requestId: 'r2' }, { ...QUIET, pending: A })).toHaveProperty('excerpt')
  })
  test("the draft's and the band's own words", () => {
    expect(judge({ text: 'my draft' }, { ...QUIET, draft: 'this is my draft' })).toEqual({ reason: 'nothing' })
    expect(judge({ text: '② You “two” — hm' }, { ...QUIET, pending: A })).toEqual({ reason: 'nothing' })
    expect(judge({ text: 'my draft', requestId: 'r1' }, { ...QUIET, draft: 'this is my draft' })).toHaveProperty('excerpt')
  })
  test('excerptOf drops the 📎 line and any head of it', () => {
    expect(excerptOf({ text: 'q\n📎 3 annotations' })).toEqual({ text: 'q' })
    expect(excerptOf({ text: 'q\n  📎 3 ann' })).toEqual({ text: 'q' })
  })
})

describe('editing the list', () => {
  test('appended numbers from the list', () => {
    expect(appended(A, { text: 'four', requestId: 'r9' }, 'claude').at(-1)).toEqual({ index: 4, text: 'four', source: 'claude', rowId: 'r9' })
  })
  test('withComment trims, and an empty one removes it', () => {
    expect(withComment(A, 1, '  why? ')[0]!.comment).toBe('why?')
    expect(withComment(A, 2, '   ')[1]!.comment).toBeUndefined()
  })
  test('without renumbers, and the open Comment field follows', () => {
    expect(without(A, 1).map(a => [a.index, a.text])).toEqual([[1, 'two'], [2, 'three']])
    expect([commentingAfterRemoving(3, 1), commentingAfterRemoving(1, 1), commentingAfterRemoving(1, 2), commentingAfterRemoving(null, 1)]).toEqual([2, null, 1, null])
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
    expect(annotated('[{{request}}] {{count}}', 'q', undefined, A)).toEqual({ text: '[q] 3', context: undefined, original: { text: 'q', count: 3 } })
    expect(annotated('{{count}} notes', 'q', ['c0'], A)).toEqual({ text: 'q', context: ['c0', '3 notes'] })
  })
  test('withOriginal keeps the newest', () => {
    const map = withOriginal({ a: { text: '1', count: 1 }, b: { text: '2', count: 1 } }, 'c', { text: '3', count: 1 }, 2)
    expect(Object.keys(map)).toEqual(['b', 'c'])
  })
})
