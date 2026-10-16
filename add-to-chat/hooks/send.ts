// What the person's prompt carries once the Annotations go with it.
import type { Annotation, Original } from '../types'
import { renderTemplate } from './template'

export type Annotated = {
  text: string
  /** What the prompt's row draws instead: the text as typed. */
  original: Original
}

/** The prompt rewritten by the Annotation Template, and what was typed. */
export function annotated(text: string, list: readonly Annotation[]): Annotated {
  return { text: renderTemplate(text, list), original: { text, count: list.length, annotations: [...list] } }
}

/** The originals map with one more, the oldest dropped past `max`. */
export function withOriginal(map: Readonly<Record<string, Original>>, key: string, original: Original, max: number): Record<string, Original> {
  const kept = Object.entries(map).filter(([k]) => k !== key)
  return Object.fromEntries([...kept.slice(-(max - 1)), [key, original]])
}
