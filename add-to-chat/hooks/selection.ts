// Deciding what a mouse selection is: an Excerpt worth offering, the band's
// or the draft's own words, or one already handled. Pure: register.tsx reads
// the selection and the state and acts on the answer.
import type { Annotation, Candidate } from '../types'
import { stripMarks } from './excerpt'
import { bandLines } from './labels'

export type Selection = { text: string; requestId?: string }

export function selectionKey(s: Selection): string {
  return `${s.requestId ?? ''}\u0000${s.text}`
}

/**
 * The Excerpt a selection holds: its text with marks and the `📎` line (this
 * mod's own, any head of it) gone; null when nothing is left.
 */
export function excerptOf(s: Selection | undefined): Selection | null {
  if (s === undefined) return null
  const text = stripMarks(s.text)
    .split('\n')
    .filter(line => !/^\s*📎( \d*( a(n(n(o(t(a(t(i(o(n(s)?)?)?)?)?)?)?)?)?)?)?)?\s*$/.test(line))
    .join('\n')
    .trim()
  return text === '' ? null : { text, requestId: s.requestId }
}

function flatten(text: string): string {
  return text.replace(/▎/g, '').replace(/\s+/g, ' ').trim()
}

/** What the band and the prompt box hold while a selection is judged. */
export type Surroundings = {
  draft: string
  offer: Candidate | null
  pending: readonly Annotation[]
  /** `selectionKey` of the selection last added or ignored. */
  handled: string | null
}

/**
 * Whether a selection with no row lies in the prompt box or in the band
 * itself rather than in the transcript: its text is the draft's or the
 * band's own.
 */
export function isOutsideTranscript(excerpt: Selection, around: Surroundings): boolean {
  if (excerpt.requestId !== undefined) return false
  const text = flatten(excerpt.text)
  return flatten(around.draft).includes(text) || bandLines(around.pending).some(line => flatten(line).includes(text))
}

export type Verdict = { excerpt: Selection } | { reason: 'nothing' | 'already' }

/**
 * What to do with a selection: offer (and add) its Excerpt, or not —
 * `nothing` when it holds none or lies outside the transcript, `already`
 * when it was last added or ignored, or is pending (same Excerpt, same row).
 */
export function judge(selection: Selection | undefined, around: Surroundings): Verdict {
  const excerpt = excerptOf(selection)
  if (selection === undefined || excerpt === null || isOutsideTranscript(excerpt, around)) return { reason: 'nothing' }
  if (selectionKey(selection) === around.handled) return { reason: 'already' }
  if (around.pending.some(a => a.text === excerpt.text && a.rowId === excerpt.requestId)) return { reason: 'already' }
  return { excerpt }
}
