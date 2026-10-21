// The Originals on their own: kept in state, mirrored in the store as
// writes, the newest 200, read back as a session loads them.
import { describe, expect, test } from 'claude-code/testing'

import type { Original } from '../types'
import { MAX_ORIGINALS, forgotten, hasAnnotations, keysToLoad, loaded, originalKey, originalOf, promptHash, remembered, replyKey, stored, withReplies } from '../hooks/originals'
import type { Originals, StoreWrite } from '../hooks/originals'

const one = { index: 1, text: 't', source: 'user' as const }
const O: Original = { text: 'typed', count: 1, annotations: [one] }

/** The store as a Map, with writes made in order, as register.tsx makes them. */
function apply(store: Map<string, unknown>, writes: readonly StoreWrite[]) {
  for (const w of writes) 'set' in w ? store.set(w.set, w.value) : store.delete(w.delete)
}

function seeded(n: number): { map: Originals; store: Map<string, unknown> } {
  const store = new Map<string, unknown>(Array.from({ length: n }, (_, i) => [originalKey(`h${i}`), { text: `t${i}`, count: 1 }]))
  return { map: loaded(Object.fromEntries(store), [...store.keys()]), store }
}

describe('the Originals', () => {
  test('found by the rewritten text; one with Annotations to show again', () => {
    const map = { [promptHash('rewritten')]: O }
    expect(originalOf(map, 'rewritten')).toEqual({ hash: promptHash('rewritten'), original: O })
    expect(originalOf(map, 'other')).toBeUndefined()
    expect([hasAnnotations(O), hasAnnotations({ text: 'x', count: 1 }), hasAnnotations(undefined)]).toEqual([true, false, false])
  })

  test('remembered before sending, keeping the replies of one sent again; forgotten as it was if dropped', () => {
    const map = { a: { text: 'old', count: 1, replies: ['r1'] } }
    expect(remembered(map, 'a', O).a).toEqual({ ...O, replies: ['r1'] })
    expect(forgotten(remembered(map, 'a', O), 'a', map.a)).toEqual(map)
    expect(forgotten(remembered({}, 'b', O), 'b', undefined)).toEqual({})
  })

  test('stored: its record deleted, then set without its replies, so it counts as the newest', () => {
    const map = remembered({ a: { ...O, replies: ['r1'] } }, 'a', O)
    expect(stored(map, 'a', [originalKey('a')]).writes).toEqual([{ delete: originalKey('a') }, { set: originalKey('a'), value: O }])
  })

  test('past 200 records the oldest goes from the store and from state, with its replies, and nothing else', () => {
    const { map, store } = seeded(MAX_ORIGINALS)
    store.set(replyKey('h0', 'x'), true)
    store.set(replyKey('h1', 'y'), true)
    const now = stored({ legacy: { text: 'only in 0.4.0', count: 1 }, ...remembered(map, 'new', O) }, 'new', [...store.keys()])
    apply(store, now.writes)
    expect([store.has(originalKey('h0')), store.has(replyKey('h0', 'x')), store.has(replyKey('h1', 'y'))]).toEqual([false, false, true])
    expect(Object.keys(now.originals).filter(h => h.startsWith('h')).length).toBe(MAX_ORIGINALS - 1)
    expect(['h0' in now.originals, 'legacy' in now.originals, 'new' in now.originals]).toEqual([false, true, true])
  })

  test('replies kept: in state each once, in the store a key each', () => {
    const now = withReplies({ a: { ...O, replies: ['r1'] } }, 'a', ['r1', 'r2'])
    expect(now.originals.a!.replies).toEqual(['r1', 'r2'])
    expect(now.writes).toEqual([{ set: replyKey('a', 'r1'), value: true }, { set: replyKey('a', 'r2'), value: true }])
    expect(withReplies({}, 'gone', ['r3']).originals).toEqual({})
  })

  test("loaded: 0.4.0's map under the records of their own keys, the replies of both and of the reply keys", () => {
    const keys = ['originals', originalKey('a'), replyKey('a', 'r3'), 'other', replyKey('nobody', 'r4')]
    expect(keysToLoad(keys)).toEqual(['originals', originalKey('a')])
    const values = { originals: { a: { text: 'old', count: 1, replies: ['r1'] }, b: { text: 'b', count: 2 }, bad: { text: 1 } }, [originalKey('a')]: { text: 'new', count: 1, replies: ['r2'] } }
    expect(loaded(values, keys)).toEqual({ a: { text: 'new', count: 1, replies: ['r2', 'r1', 'r3'] }, b: { text: 'b', count: 2 } })
  })
})
