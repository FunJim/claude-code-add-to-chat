// The pending list's edits, as pure functions of the list.
import type { Annotation, AnnotationSource } from '../types'
import type { Selection } from './selection'

export function appended(list: readonly Annotation[], excerpt: Selection, source: AnnotationSource): Annotation[] {
  return [...list, { index: list.length + 1, text: excerpt.text, source, requestId: excerpt.requestId }]
}

export function withComment(list: readonly Annotation[], index: number, value: string): Annotation[] {
  const comment = value.trim()
  return list.map(a => (a.index === index ? { ...a, comment: comment === '' ? undefined : comment } : a))
}

/** The list with each Comment field's text as its Annotation's Comment (`drafts` by index). */
export function withComments(list: readonly Annotation[], drafts: Readonly<Record<string, string>>): Annotation[] {
  return Object.entries(drafts).reduce((now, [index, value]) => withComment(now, Number(index), value), [...list])
}

/** The list without one, renumbered from 1. */
export function without(list: readonly Annotation[], index: number): Annotation[] {
  return list.filter(a => a.index !== index).map((a, i) => ({ ...a, index: i + 1 }))
}

/**
 * The list with a sent prompt's Annotations back, after those it holds,
 * numbered on; one already in the list (same Excerpt, same row) is not
 * added twice.
 */
export function restored(list: readonly Annotation[], sent: readonly Annotation[]): Annotation[] {
  const has = (a: Annotation) => list.some(b => b.text === a.text && b.requestId === a.requestId)
  return [...list, ...sent.filter(a => !has(a)).map((a, i) => ({ ...a, index: list.length + i + 1 }))]
}

export function marksFor(list: readonly Annotation[], requestId: string | undefined): Annotation[] {
  return list.filter(a => a.requestId !== undefined && a.requestId === requestId)
}
