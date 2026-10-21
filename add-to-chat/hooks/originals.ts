// The Originals: what was typed for each prompt sent with Annotations, by the
// hash of its rewritten text, in state and mirrored in `$.store` (ADR 0004).
// Every rule of how they are kept lives here: the key formats, the newest
// 200, the order of the writes, 0.4.0's map read and never written. What
// touches the store comes back as writes, for register.tsx to make in order.
import type { Annotation, Original } from '../types'
import { hashText } from './hash'

const KEY_PREFIX = 'original:'
const REPLY_PREFIX = 'reply:'
/** The one map of Originals 0.4.0 and earlier kept: read, never written. */
const LEGACY_KEY = 'originals'
export const MAX_ORIGINALS = 200

export type Originals = Record<string, Original>

/** One write to the store; a list of them is made in its order. */
export type StoreWrite = { set: string; value: unknown } | { delete: string }

/** An Original known to hold its Annotations (one sent from 0.3.0 on, with some). */
export type Annotated = Original & { annotations: Annotation[] }

/** The key a rewritten prompt's Original is kept under: its text as the row and the transcript give it, byte for byte. */
export function promptHash(rewritten: string): string {
  return hashText(rewritten)
}

/** The Original kept for a row's or a message's text, and its hash. */
export function originalOf(map: Originals, rewritten: string): { hash: string; original: Original } | undefined {
  const hash = promptHash(rewritten)
  const original = map[hash]
  return original === undefined ? undefined : { hash, original }
}

/** Whether an Original holds Annotations to show again. */
export function hasAnnotations(o: Original | undefined): o is Annotated {
  return o?.annotations !== undefined && o.annotations.length > 0
}

/**
 * A prompt about to be sent, in state: the row draws from it as soon as the
 * engine draws the rewritten text. Sent again, it keeps the replies kept
 * with it, as the store does.
 */
export function remembered(map: Originals, hash: string, original: Original): Originals {
  const replies = map[hash]?.replies
  return { ...map, [hash]: replies === undefined ? original : { ...original, replies } }
}

/** A prompt that was not sent after all (another plugin dropped it): its entry as it was before. */
export function forgotten(map: Originals, hash: string, was: Original | undefined): Originals {
  if (was !== undefined) return { ...map, [hash]: was }
  const { [hash]: _, ...rest } = map
  return rest
}

/**
 * A sent prompt, in the store: its record deleted first and set, so the
 * store's insertion order counts it as the newest; then, past the newest
 * 200 records, the oldest with their replies' keys. `keys` are the store's
 * keys before these writes. State lets go of the same prompts, and of no
 * other: one only 0.4.0's map holds stays.
 */
export function stored(map: Originals, hash: string, keys: readonly string[]): { originals: Originals; writes: StoreWrite[] } {
  const key = originalKey(hash)
  const { replies: _, ...record } = map[hash]!
  const after = [...keys.filter(k => k !== key), key]
  const records = after.filter(k => hashOfKey(k) !== undefined)
  const old = new Set(records.slice(0, Math.max(0, records.length - MAX_ORIGINALS)).map(k => hashOfKey(k)!))
  const gone = after.filter(k => old.has(hashOfKey(k) ?? replyOfKey(k)?.hash ?? ''))
  const originals = old.size === 0 ? map : Object.fromEntries(Object.entries(map).filter(([h]) => !old.has(h)))
  return { originals, writes: [{ delete: key }, { set: key, value: record }, ...gone.map(k => ({ delete: k }))] }
}

/**
 * Reply rows (requestIds) kept with a sent prompt: in state, and in the
 * store under a key each, set and never read back to be set again, so two
 * sessions keeping replies to the same prompt keep both.
 */
export function withReplies(map: Originals, hash: string, ids: readonly string[]): { originals: Originals; writes: StoreWrite[] } {
  const o = map[hash]
  const originals = o === undefined || ids.length === 0 ? map : { ...map, [hash]: { ...o, replies: [...new Set([...(o.replies ?? []), ...ids])] } }
  return { originals, writes: ids.map(id => ({ set: replyKey(hash, id), value: true })) }
}

/** The store keys a load reads the values of: 0.4.0's map and every record. */
export function keysToLoad(keys: readonly string[]): string[] {
  return [LEGACY_KEY, ...keys.filter(k => hashOfKey(k) !== undefined)]
}

/**
 * The Originals the store holds, from the values of `keysToLoad` and all its
 * keys: those of 0.4.0's map, each under the record of its own key where
 * there is one, the replies of all three (that map, a record of 0.4.1, the
 * reply keys) together. Reads only, so it cannot drop what another session
 * writes meanwhile.
 */
export function loaded(values: Readonly<Record<string, unknown>>, keys: readonly string[]): Originals {
  const map: Originals = {}
  const legacy = values[LEGACY_KEY]
  if (typeof legacy === 'object' && legacy !== null) {
    for (const [hash, o] of Object.entries(legacy)) if (isOriginal(o)) map[hash] = o
  }
  for (const key of keys) {
    const hash = hashOfKey(key)
    const o = hash === undefined ? undefined : values[key]
    if (hash === undefined || !isOriginal(o)) continue
    const older = map[hash]?.replies ?? []
    map[hash] = older.length > 0 ? addReplies(o, older) : o
  }
  for (const key of keys) {
    const r = replyOfKey(key)
    if (r !== undefined && map[r.hash] !== undefined) map[r.hash] = addReplies(map[r.hash]!, [r.id])
  }
  return map
}

/** The store key of one sent prompt's Original. */
export function originalKey(hash: string): string {
  return `${KEY_PREFIX}${hash}`
}

/** The store key of one reply kept with a sent prompt. (A hash holds no colon.) */
export function replyKey(hash: string, id: string): string {
  return `${REPLY_PREFIX}${hash}:${id}`
}

function hashOfKey(key: string): string | undefined {
  return key.startsWith(KEY_PREFIX) ? key.slice(KEY_PREFIX.length) : undefined
}

function replyOfKey(key: string): { hash: string; id: string } | undefined {
  if (!key.startsWith(REPLY_PREFIX)) return undefined
  const rest = key.slice(REPLY_PREFIX.length)
  const at = rest.indexOf(':')
  return at <= 0 ? undefined : { hash: rest.slice(0, at), id: rest.slice(at + 1) }
}

function isOriginal(value: unknown): value is Original {
  const o = value as Partial<Original> | null
  return typeof o === 'object' && o !== null && typeof o.text === 'string' && typeof o.count === 'number'
}

function addReplies(original: Original, more: readonly string[]): Original {
  return { ...original, replies: [...new Set([...(original.replies ?? []), ...more])] }
}
