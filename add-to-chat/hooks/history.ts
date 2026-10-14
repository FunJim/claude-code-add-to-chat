// Sent prompts' Annotations: which prompts are this conversation's, and
// which sent prompt a reply answers.
import type { Annotation, Original } from '../types'
import { hashText } from './hash'
import { oneLine } from './text'

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
