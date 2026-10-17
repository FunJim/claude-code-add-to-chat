// Sent prompts' Annotations: how they are kept in the store, which prompts
// are this conversation's, and which sent prompt a reply answers.
import type { Annotation, Original } from '../types'
import { hashText } from './hash'
import { oneLine } from './text'

const KEY_PREFIX = 'original:'
const REPLY_PREFIX = 'reply:'

/**
 * The store key of one sent prompt's Original, by the hash of its rewritten
 * text: one record each, so sessions writing at once never drop each
 * other's.
 */
export function originalKey(hash: string): string {
  return `${KEY_PREFIX}${hash}`
}

/** The hash a store key holds an Original under; undefined for any other key. */
export function hashOfKey(key: string): string | undefined {
  return key.startsWith(KEY_PREFIX) ? key.slice(KEY_PREFIX.length) : undefined
}

/**
 * The store key of one reply kept with a sent prompt: a key of its own, set
 * and never read back to be set again, so two sessions keeping replies to
 * the same prompt keep both. (A hash holds no colon.)
 */
export function replyKey(hash: string, id: string): string {
  return `${REPLY_PREFIX}${hash}:${id}`
}

/** The prompt's hash and the reply's id a store key holds; undefined for any other key. */
export function replyOfKey(key: string): { hash: string; id: string } | undefined {
  if (!key.startsWith(REPLY_PREFIX)) return undefined
  const rest = key.slice(REPLY_PREFIX.length)
  const at = rest.indexOf(':')
  return at <= 0 ? undefined : { hash: rest.slice(0, at), id: rest.slice(at + 1) }
}

/**
 * The keys to delete once the store holds more than `max` Originals: the
 * oldest, by the store's insertion order, and their replies' keys.
 */
export function evictedKeys(keys: readonly string[], max: number): string[] {
  const records = keys.filter(k => hashOfKey(k) !== undefined)
  const old = records.slice(0, Math.max(0, records.length - max))
  const hashes = new Set(old.map(k => hashOfKey(k)!))
  return [...old, ...keys.filter(k => hashes.has(replyOfKey(k)?.hash ?? ''))]
}

/** Whether a stored value is an Original. */
export function isOriginal(value: unknown): value is Original {
  const o = value as Partial<Original> | null
  return typeof o === 'object' && o !== null && typeof o.text === 'string' && typeof o.count === 'number'
}

/**
 * The Originals the store holds: those of the one map 0.4.0 and earlier
 * kept (read, never written: a session writing it back could drop what
 * another wrote meanwhile), each under the record of its own key where
 * there is one, the replies of all three (that map, a record of 0.4.1, the
 * reply keys) together.
 */
export function assembleOriginals(legacy: unknown, records: readonly (readonly [string, unknown])[], keys: readonly string[]): Record<string, Original> {
  const map: Record<string, Original> = {}
  if (typeof legacy === 'object' && legacy !== null) {
    for (const [hash, o] of Object.entries(legacy)) if (isOriginal(o)) map[hash] = o
  }
  for (const [hash, o] of records) {
    if (!isOriginal(o)) continue
    const older = map[hash]?.replies ?? []
    map[hash] = older.length > 0 ? withReplies(o, older) : o
  }
  for (const key of keys) {
    const r = replyOfKey(key)
    if (r !== undefined && map[r.hash] !== undefined) map[r.hash] = withReplies(map[r.hash]!, [r.id])
  }
  return map
}

/**
 * The rewritten prompts in a transcript (its user messages, as
 * `$.session.messages()` gives them), by the hash `originals` is keyed by,
 * oldest first; each once.
 */
export function promptsIn(messages: readonly { role: string; text: string }[], originals: Record<string, Original>): string[] {
  const hashes = messages.filter(m => m.role === 'user').map(m => hashText(m.text))
  return [...new Set(hashes.filter(h => originals[h] !== undefined))]
}

/** A sent prompt the pane's history lists. */
export type SentPrompt = { hash: string; text: string; annotations: Annotation[] }

/** The prompts of this conversation whose Annotations are known, newest first. */
export function sentPrompts(originals: Record<string, Original>, inSession: readonly string[]): SentPrompt[] {
  return inSession
    .flatMap(hash => {
      const o = originals[hash]
      return o?.annotations !== undefined && o.annotations.length > 0 ? [{ hash, text: o.text, annotations: o.annotations }] : []
    })
    .reverse()
}

/** A sent prompt with Annotations that a text in the prompt box is. */
export type InBox = {
  hash: string
  original: Original & { annotations: Annotation[] }
  /** Whether it was sent in this conversation (`inSession`). */
  isHere: boolean
}

/**
 * The sent prompt with Annotations that `text` is: its rewritten text, as a
 * rewind or the prompt history first gives it back, or what was typed for
 * one of this conversation's, as the history gives it back once the mod
 * filled that in. The newest of several.
 */
export function sentInBox(text: string, originals: Record<string, Original>, inSession: readonly string[]): InBox | undefined {
  const withAnnotations = (hash: string): InBox | undefined => {
    const o = originals[hash]
    return o?.annotations !== undefined && o.annotations.length > 0 ? { hash, original: { ...o, annotations: o.annotations }, isHere: inSession.includes(hash) } : undefined
  }
  const rewritten = withAnnotations(hashText(text))
  if (rewritten !== undefined) return rewritten
  const typed = [...inSession].reverse().find(hash => originals[hash]?.text === text)
  return typed === undefined ? undefined : withAnnotations(typed)
}

/** Each reply row known to answer a prompt in `inSession` → that prompt's Annotation count. */
export function replyCountsOf(originals: Record<string, Original>, inSession: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const hash of inSession) {
    const o = originals[hash]
    for (const id of o?.replies ?? []) counts[id] = o!.count
  }
  return counts
}

/** Whether two records hold the same keys and values. */
export function sameRecord(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every(k => a[k] === b[k])
}

/** `replies` with `more` added, each once. */
export function withReplies(original: Original, more: readonly string[]): Original {
  return { ...original, replies: [...new Set([...(original.replies ?? []), ...more])] }
}

/** A reply row noted during a turn: its requestId, and its text as it drew. */
export type NotedReply = { id: string; text: string }

/**
 * The noted rows that are the turn's own replies: those whose text is in an
 * assistant message after the prompt (`hash`) in the transcript, before the
 * next prompt. An older
 * reply first drawn during the turn (scrolled to) is not. Without the
 * prompt in the transcript, every noted row is kept.
 */
export function turnReplies(messages: readonly { role: string; text: string }[], hash: string, noted: readonly NotedReply[]): string[] {
  const at = messages.findLastIndex(m => m.role === 'user' && hashText(m.text) === hash)
  if (at === -1) return noted.map(r => r.id)
  // Up to the next prompt (a user message with text; tool results have none).
  const next = messages.findIndex((m, i) => i > at && m.role === 'user' && m.text !== '')
  const said = oneLine(
    messages
      .slice(at + 1, next === -1 ? undefined : next)
      .filter(m => m.role === 'assistant')
      .map(m => m.text)
      .join('\n'),
  )
  return noted.filter(r => said.includes(oneLine(r.text))).map(r => r.id)
}
