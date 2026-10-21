// Which sent prompt a reply answers, and so how far its Citations may go:
// the reply rows first drawn after a prompt sent with Annotations, noted
// as they draw, and checked against the transcript once the turn has ended.
// A value with pure transitions; register.tsx holds the one current value,
// since render hooks note rows and may not write state.
import { promptHash } from './originals'
import { oneLine } from './text'

/** A reply row noted during a turn: its requestId, and its text as it drew. */
export type NotedReply = { id: string; text: string }

/**
 * The last prompt sent with Annotations, and the reply rows first drawn
 * since: the rows noted with their latest text, and which of them the
 * transcript showed to answer it (`kept`) or not (`rejected`). It stays
 * open past the turn's end, since a short reply can first draw after
 * `turn.complete`, until the next typed prompt or another session. Once the
 * turn has ended, noted rows are checked while any changed (`isDirty`).
 */
export type Answering = {
  hash: string
  count: number
  noted: NotedReply[]
  kept: string[]
  rejected: string[]
  hasEnded: boolean
  isDirty: boolean
}

export type Replies = {
  /** Reply rows (requestIds) drawn since the load: a row new to it during a turn is that turn's. */
  drawn: ReadonlySet<string>
  answering: Answering | null
}

export const NO_REPLIES: Replies = { drawn: new Set(), answering: null }

/** A prompt sent with Annotations (`hash`, `count` of them): the rows drawn from now on are noted for it. */
export function promptSent(r: Replies, hash: string, count: number): Replies {
  return { ...r, answering: { hash, count, noted: [], kept: [], rejected: [], hasEnded: false, isDirty: false } }
}

/** A prompt typed without Annotations, or another session: no row is noted any more. */
export function settled(r: Replies): Replies {
  return r.answering === null ? r : { ...r, answering: null }
}

/** A reply row drawn: noted if new since the load, or its text kept up to date if noted. The same value if nothing changed. */
export function drawn(r: Replies, id: string | undefined, text: string): Replies {
  if (id === undefined || id === 'placeholder') return r
  const a = r.answering
  const noted = a?.noted.find(n => n.id === id)
  if (a !== null && noted !== undefined) {
    if (noted.text === text) return r
    return { ...r, answering: { ...a, noted: a.noted.map(n => (n.id === id ? { id, text } : n)), isDirty: true } }
  }
  if (r.drawn.has(id)) return r
  const seen = new Set(r.drawn).add(id)
  return { drawn: seen, answering: a === null ? null : { ...a, noted: [...a.noted, { id, text }], isDirty: true } }
}

/**
 * The Citations a reply row may draw: to the count of the prompt it is
 * known to answer (`counts`); else, noted since the last prompt and not let
 * go by the check, to that prompt's. An older reply first drawn since
 * (scrolled to) is known to answer its own prompt, if it answered one sent
 * with Annotations.
 */
export function bound(r: Replies, id: string | undefined, counts: Readonly<Record<string, number>>): number | undefined {
  if (id === undefined) return undefined
  const known = counts[id]
  if (known !== undefined) return known
  const a = r.answering
  return a !== null && !a.rejected.includes(id) && a.noted.some(n => n.id === id) ? a.count : undefined
}

/** The main loop's turn ended: the noted rows are to be checked, now and whenever more are noted. */
export function ended(r: Replies): Replies {
  return r.answering === null ? r : { ...r, answering: { ...r.answering, hasEnded: true, isDirty: true } }
}

/**
 * Whether the noted rows are to be checked: the value with the check
 * begun, and the prompt to check them for; undefined if not.
 */
export function toCheck(r: Replies): { replies: Replies; hash: string } | undefined {
  const a = r.answering
  if (a === null || !a.hasEnded || !a.isDirty) return undefined
  return { replies: { ...r, answering: { ...a, isDirty: false } }, hash: a.hash }
}

/**
 * The check against the transcript: the rows that answer the prompt kept,
 * the others let go; `fresh`, those kept by no check before, to keep with
 * its Original. Rows noted while the transcript was read are checked too;
 * a prompt sent meanwhile is left as it is.
 */
export function checked(r: Replies, hash: string, messages: readonly { role: string; text: string }[]): { replies: Replies; fresh: string[] } {
  const a = r.answering
  if (a === null || a.hash !== hash) return { replies: r, fresh: [] }
  const kept = turnReplies(messages, hash, a.noted)
  const fresh = kept.filter(id => !a.kept.includes(id))
  const rejected = a.noted.map(n => n.id).filter(id => !kept.includes(id))
  return { replies: { ...r, answering: { ...a, kept, rejected } }, fresh }
}


/**
 * The noted rows that are the turn's own replies: those whose text is in an
 * assistant message after the prompt (`hash`) in the transcript, before the
 * next prompt. An older
 * reply first drawn during the turn (scrolled to) is not. Without the
 * prompt in the transcript, every noted row is kept.
 */
export function turnReplies(messages: readonly { role: string; text: string }[], hash: string, noted: readonly NotedReply[]): string[] {
  const at = messages.findLastIndex(m => m.role === 'user' && promptHash(m.text) === hash)
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
