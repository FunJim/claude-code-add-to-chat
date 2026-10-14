// What a transcript row draws: Citations and marks in replies, and a
// rewritten prompt as the person typed it.
import type { Annotation, Original } from '../types'
import { marksFor } from './annotations'
import { drawCitations, drawMarks } from './excerpt'
import { clipLine } from './labels'

/** A reply row's text: its Citations (to `count`, the prompt it answers was sent with, when known) and marks. */
export function replyText(text: string, requestId: string | undefined, pending: readonly Annotation[], count?: number): string {
  return drawMarks(drawCitations(text, count), marksFor(pending, requestId), 'assistant')
}

/**
 * A prompt row's text: the original for a rewritten prompt (with a `📎` line;
 * none while expanded, where ctrl+o shows what the model read), marks drawn.
 */
/** A rewritten prompt row's original, as typed, with the marks of the Annotations pending in it. */
export function originalText(original: Original, requestId: string | undefined, pending: readonly Annotation[]): string {
  return drawMarks(original.text, marksFor(pending, requestId), 'user')
}

export function promptText(
  text: string,
  requestId: string | undefined,
  pending: readonly Annotation[],
  original: Original | undefined,
): string {
  const drawn = drawMarks(original?.text ?? text, marksFor(pending, requestId), 'user')
  return original === undefined ? drawn : `${drawn}\n${clipLine(original.count)}`
}
