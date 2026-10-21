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
