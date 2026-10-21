// What is pending, edited as one value: the list, the Comment fields' text,
// the tab and a recall's Annotations kept in step.
import { describe, expect, test } from 'claude-code/testing'

import type { Annotation } from '../types'
import { added, cleared, drafted, flushed, isSameExcerpt, recalledBack, removed, saved, shown, withoutRecalled } from '../hooks/annotations'
import type { Pending } from '../hooks/annotations'

const A: Annotation[] = [
  { index: 1, text: 'one', source: 'assistant', requestId: 'r1' },
  { index: 2, text: 'two', source: 'user', requestId: 'u1', comment: 'hm' },
  { index: 3, text: 'three', source: 'transcript' },
]
const P: Pending = { list: A, drafts: {}, tab: 1, recalled: null }

const texts = (p: Pending) => p.list.map(a => [a.index, a.text, a.comment])

describe('editing what is pending', () => {
  test('added numbers on from the list and shows its tab', () => {
    const now = added(P, { text: 'four', requestId: 'r9' }, 'assistant')
    expect(now.list.at(-1)).toEqual({ index: 4, text: 'four', source: 'assistant', requestId: 'r9' })
    expect(now.tab).toBe(4)
  })

  test('removed renumbers; the tab stays on its Annotation, or goes to the one that took its place', () => {
    expect(texts(removed(P, 1))).toEqual([[1, 'two', 'hm'], [2, 'three', undefined]])
    expect([removed({ ...P, tab: 3 }, 1).tab, removed({ ...P, tab: 1 }, 1).tab, removed({ ...P, tab: 1 }, 2).tab]).toEqual([2, 1, 1])
  })

  test("a Comment field's text is kept as its Comment before a renumbering, so it stays with its Annotation", () => {
    const now = removed({ ...P, drafts: { 3: 'typed in three', 1: 'typed in one' } }, 1)
    expect(texts(now)).toEqual([[1, 'two', 'hm'], [2, 'three', 'typed in three']])
    expect(now.drafts).toEqual({})
  })

  test('flushed trims, an emptied field drops the Comment; nothing typed changes nothing', () => {
    expect(texts(flushed({ ...P, drafts: { 1: '  why? ', 2: '   ' } }))).toEqual([[1, 'one', 'why?'], [2, 'two', undefined], [3, 'three', undefined]])
    expect(flushed(P)).toBe(P)
  })

  test('shown keeps the field it leaves; saved keeps one Comment and drops its draft', () => {
    expect(texts(shown({ ...P, drafts: { 1: 'left' } }, 2))[0]).toEqual([1, 'one', 'left'])
    const now = saved({ ...P, drafts: { 1: 'x', 3: 'y' } }, 1, ' kept ')
    expect([now.list[0]!.comment, now.drafts]).toEqual(['kept', { 3: 'y' }])
    expect(drafted({ 1: 'a' }, 2, 'b')).toEqual({ 1: 'a', 2: 'b' })
  })

  test('cleared empties the list, the drafts and the recall', () => {
    expect(cleared({ ...P, drafts: { 1: 'x' }, recalled: { annotations: [] } })).toEqual({ list: [], drafts: {}, tab: 1, recalled: null })
  })

  test("a recall's Annotations go after those pending, numbered on, not twice; the first shows", () => {
    const sent: Annotation[] = [
      { index: 1, text: 'two', source: 'user', requestId: 'u1' },
      { index: 2, text: 'back', source: 'assistant', requestId: 'r5', comment: 'why?' },
    ]
    const now = recalledBack(P, sent)
    expect(texts(now).slice(3)).toEqual([[4, 'back', 'why?']])
    expect(now.tab).toBe(4)
    expect(now.recalled).toEqual({ annotations: [{ text: 'back', requestId: 'r5' }] })
    expect(recalledBack(P, A)).toBe(P)
  })

  test("withoutRecalled takes a recall's out, renumbers, and the Comment typed in one after them stays with it", () => {
    const back = recalledBack({ ...P, list: [] }, A)
    const after = added(back, { text: 'four', requestId: 'r9' }, 'assistant')
    const now = withoutRecalled({ ...after, drafts: { 4: 'typed in four' } })
    expect(texts(now)).toEqual([[1, 'four', 'typed in four']])
    expect([now.tab, now.recalled]).toEqual([1, null])
  })

  test('withoutRecalled with `only` leaves a later recall alone', () => {
    const first = recalledBack({ ...P, list: [] }, [A[0]!])
    const later = recalledBack(withoutRecalled(first), [A[1]!])
    expect(withoutRecalled(later, first.recalled!)).toBe(later)
    expect(withoutRecalled(later, later.recalled!).list).toEqual([])
    expect(withoutRecalled(P)).toBe(P)
  })

  test('the same Excerpt is the same text in the same row', () => {
    expect([isSameExcerpt(A[0]!, { text: 'one', requestId: 'r1' }), isSameExcerpt(A[0]!, { text: 'one' })]).toEqual([true, false])
  })
})
