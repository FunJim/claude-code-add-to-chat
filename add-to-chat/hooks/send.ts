// What the person's prompt carries once the Annotations go with it.
import type { Annotation, Original } from '../types'
import { renderTemplate, usesRequest } from './template'

export type Annotated = {
  text: string
  context?: readonly string[]
  /** For a rewritten prompt: what its row draws instead. */
  original?: Original
}

/**
 * A template with `{{request}}` becomes the prompt's text; one without rides
 * beside it as one more `context` entry.
 */
export function annotated(template: string, text: string, context: readonly string[] | undefined, list: readonly Annotation[]): Annotated {
  const rendered = renderTemplate(template, text, list)
  if (!usesRequest(template)) return { text, context: [...(context ?? []), rendered] }
  return { text: rendered, context, original: { text, count: list.length, annotations: [...list] } }
}

/** The originals map with one more, the oldest dropped past `max`. */
export function withOriginal(map: Readonly<Record<string, Original>>, key: string, original: Original, max: number): Record<string, Original> {
  const kept = Object.entries(map).filter(([k]) => k !== key)
  return Object.fromEntries([...kept.slice(-(max - 1)), [key, original]])
}
