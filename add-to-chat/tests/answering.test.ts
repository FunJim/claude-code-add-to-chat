// Which prompt a reply answers, as a value: rows noted as they draw, bounded
// by the last prompt sent with Annotations, checked once the turn has ended.
import { describe, expect, test } from 'claude-code/testing'

import { NO_REPLIES, bound, checked, drawn, ended, promptSent, settled, toCheck } from '../hooks/answering'
import type { Replies } from '../hooks/answering'
import { hashText } from '../hooks/hash'

const P = 'the rewritten prompt'
const H = hashText(P)

/** A turn: the prompt in the transcript, then what Claude said. */
const transcript = (...said: string[]) => [{ role: 'user', text: P }, ...said.map(text => ({ role: 'assistant', text }))]

describe('replies and the prompt they answer', () => {
  test('a row drawn before any prompt is only seen; drawn again after one, it is not noted for it', () => {
    const before = drawn(NO_REPLIES, 'old', 'older reply')
    expect(before.answering).toBeNull()
    const after = drawn(promptSent(before, H, 2), 'old', 'older reply')
    expect(after.answering!.noted).toEqual([])
    expect(bound(after, 'old', {})).toBeUndefined()
  })

  test('a row first drawn after the prompt is noted and bounded by its count; a known one keeps its own', () => {
    const r = drawn(promptSent(NO_REPLIES, H, 2), 'a', 'first')
    expect(r.answering!.noted).toEqual([{ id: 'a', text: 'first' }])
    expect([bound(r, 'a', {}), bound(r, 'a', { a: 5 }), bound(r, undefined, {})]).toEqual([2, 5, undefined])
  })

  test('the placeholder and an unchanged row change nothing; a noted row drawing on keeps its latest text', () => {
    const r = drawn(promptSent(NO_REPLIES, H, 1), 'a', 'fir')
    expect(drawn(r, 'placeholder', 'x')).toBe(r)
    expect(drawn(r, 'a', 'fir')).toBe(r)
    expect(drawn(r, 'a', 'first').answering!.noted).toEqual([{ id: 'a', text: 'first' }])
  })

  test('nothing is checked before the turn ends, nor again until a row changes', () => {
    const r = drawn(promptSent(NO_REPLIES, H, 1), 'a', 'first')
    expect(toCheck(r)).toBeUndefined()
    const begun = toCheck(ended(r))!
    expect(begun.hash).toBe(H)
    expect(toCheck(begun.replies)).toBeUndefined()
    expect(toCheck(drawn(begun.replies, 'b', 'late'))).not.toBeUndefined()
  })

  test("the check keeps the turn's own replies, once; one not said in the turn is let go and bounded no more", () => {
    let r: Replies = drawn(drawn(promptSent(NO_REPLIES, H, 3), 'a', 'first'), 'x', 'scrolled to')
    r = toCheck(ended(r))!.replies
    const once = checked(r, H, transcript('first'))
    expect(once.fresh).toEqual(['a'])
    expect([bound(once.replies, 'a', {}), bound(once.replies, 'x', {})]).toEqual([3, undefined])
    const late = checked(drawn(once.replies, 'b', 'second'), H, transcript('first', 'second'))
    expect(late.fresh).toEqual(['b'])
  })

  test('a check for a prompt no longer the last changes nothing', () => {
    const r = toCheck(ended(drawn(promptSent(NO_REPLIES, H, 1), 'a', 'first')))!.replies
    const later = promptSent(r, 'other', 2)
    expect(checked(later, H, transcript('first'))).toEqual({ replies: later, fresh: [] })
  })

  test('settled: no row is noted any more; the rows seen stay seen', () => {
    const r = settled(drawn(promptSent(NO_REPLIES, H, 1), 'a', 'first'))
    expect(r.answering).toBeNull()
    expect(r.drawn.has('a')).toBe(true)
    expect(settled(r)).toBe(r)
  })
})
