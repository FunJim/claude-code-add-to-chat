// The pending Annotations: the list, what their Comment fields hold, the tab
// the pane shows and which of them a recall brought back, edited together,
// so a renumbering never leaves a Comment field's text or the tab behind.
import type { Annotation, AnnotationSource } from '../types'
import type { Selection } from './selection'

/** What a recall brought back to pending, by Excerpt and row: the next prompt put in the box takes them out. */
export type Recalled = { annotations: Pick<Annotation, 'text' | 'requestId'>[] }

/**
 * Everything pending, as one value. A function here returns the same value
 * (and the same parts) for what it leaves unchanged, so its caller can write
 * only what changed: every transcript row reads `list`, no drawing reads
 * `drafts`.
 */
export type Pending = {
  list: Annotation[]
  /** What a Comment field holds, by its Annotation's index, typed since the last save. */
  drafts: Record<string, string>
  /** The index of the Annotation whose tab the pane shows. */
  tab: number
  recalled: Recalled | null
}

/** Whether two are the same Excerpt from the same row: one is never pending twice. */
export function isSameExcerpt(a: Pick<Annotation, 'text' | 'requestId'>, b: Pick<Annotation, 'text' | 'requestId'>): boolean {
  return a.text === b.text && a.requestId === b.requestId
}

/**
 * The Comment fields' text kept as their Comments: a field is left (a tab
 * shown, added or closed, the history opened, a recall's Annotations taken
 * out) or the prompt goes. Every edit that renumbers or moves the tab does
 * this first, so a field's text never outlives the index it was typed at.
 */
export function flushed(p: Pending): Pending {
  const entries = Object.entries(p.drafts)
  if (entries.length === 0) return p
  return { ...p, list: entries.reduce((now, [index, value]) => withComment(now, Number(index), value), p.list), drafts: {} }
}

/** One more, from `excerpt`, its tab shown. */
export function added(p: Pending, excerpt: Selection, source: AnnotationSource): Pending {
  const now = flushed(p)
  const index = now.list.length + 1
  return { ...now, list: [...now.list, { index, text: excerpt.text, source, requestId: excerpt.requestId }], tab: index }
}

/** Annotation `index` taken out, the rest renumbered from 1. */
export function removed(p: Pending, index: number): Pending {
  return kept(flushed(p), a => a.index !== index)
}

/** Annotation `index`'s tab shown. */
export function shown(p: Pending, index: number): Pending {
  const now = flushed(p)
  return now.tab === index ? now : { ...now, tab: index }
}

/** What Annotation `index`'s Comment field holds now, unsaved: the drafts with it. */
export function drafted(drafts: Readonly<Record<string, string>>, index: number, value: string): Record<string, string> {
  return { ...drafts, [index]: value }
}

/** A Comment saved with Enter: kept, its field's draft gone. */
export function saved(p: Pending, index: number, value: string): Pending {
  const drafts = Object.fromEntries(Object.entries(p.drafts).filter(([at]) => Number(at) !== index))
  return { ...p, list: withComment(p.list, index, value), drafts }
}

/** Nothing pending: the prompt went, or /clear. The tab stays, to be clamped. */
export function cleared(p: Pending): Pending {
  return { ...p, list: [], drafts: {}, recalled: null }
}

/**
 * A sent prompt's Annotations back, after those pending, numbered on; one
 * already pending is not added twice. The first of those added shows, and
 * they are the recall's.
 */
export function recalledBack(p: Pending, sent: readonly Annotation[]): Pending {
  const back = sent.filter(a => !p.list.some(b => isSameExcerpt(a, b)))
  if (back.length === 0) return p
  const now = flushed(p)
  const list = [...now.list, ...back.map((a, i) => ({ ...a, index: now.list.length + i + 1 }))]
  return { ...now, list, tab: now.list.length + 1, recalled: { annotations: back.map(a => ({ text: a.text, requestId: a.requestId })) } }
}

/**
 * The Annotations the last recall brought back taken out, the rest
 * renumbered; with `only`, only if the recall is still that one.
 */
export function withoutRecalled(p: Pending, only?: Recalled): Pending {
  const last = p.recalled
  if (last === null || (only !== undefined && JSON.stringify(last) !== JSON.stringify(only))) return p
  return { ...kept(flushed(p), a => !last.annotations.some(t => isSameExcerpt(a, t))), recalled: null }
}

/**
 * Those that `keep` keeps, renumbered from 1; the tab on the Annotation it
 * showed, or where that one stood, the one that took its place.
 */
function kept(p: Pending, keep: (a: Annotation) => boolean): Pending {
  const list = p.list.filter(keep)
  if (list.length === p.list.length) return p
  const before = list.filter(a => a.index < p.tab).length
  return { ...p, list: list.map((a, i) => ({ ...a, index: i + 1 })), tab: before + 1 }
}

function withComment(list: readonly Annotation[], index: number, value: string): Annotation[] {
  const comment = value.trim()
  return list.map(a => (a.index === index ? { ...a, comment: comment === '' ? undefined : comment } : a))
}

export function marksFor(list: readonly Annotation[], requestId: string | undefined): Annotation[] {
  return list.filter(a => a.requestId !== undefined && a.requestId === requestId)
}
