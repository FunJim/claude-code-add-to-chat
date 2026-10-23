// What a transcript row draws: Citations and marks in replies, and how a
// rewritten prompt's row is drawn: its text, or the mod's 📎 row.
import type { Annotation, Original } from '../types'
import { marksFor } from './annotations'
import { drawCitations, drawMarks } from './excerpt'
import { clipLine } from './labels'
import { hasAnnotations } from './originals'

/** A reply row's text: its Citations (to `count`, the prompt it answers was sent with, when known) and marks. */
export function replyText(text: string, requestId: string | undefined, pending: readonly Annotation[], count?: number): string {
  return drawMarks(drawCitations(text, count), marksFor(pending, requestId), 'assistant')
}

/** A sent prompt's row, decided: the text it draws, or (in the terminal, an Original with its Annotations kept) that text wrapped with the mod's 📎 row beneath. */
export type PromptRowView =
  | { kind: 'text'; text: string }
  | { kind: 'wrapped'; text: string; hash: string; count: number; annotations: readonly Annotation[] }

/**
 * How a sent prompt's row draws. As text: no Original for it (ctrl+o
 * expanded reads the prompt as the model read it), kept without its
 * Annotations (a `📎` line, but no button: sent before 0.3.0), or another
 * surface (the terminal is the only one with the 📎 row). Else wrapped:
 * the Original as typed, the row of the mod's beside it.
 */
export function promptRowView(
  row: { text: string; requestId: string | undefined; isExpanded: boolean; surface: string },
  found: { hash: string; original: Original } | undefined,
  pending: readonly Annotation[],
): PromptRowView {
  const original = row.isExpanded ? undefined : found?.original
  if (original === undefined) return { kind: 'text', text: drawMarks(row.text, marksFor(pending, row.requestId), 'user') }
  const drawn = drawMarks(original.text, marksFor(pending, row.requestId), 'user')
  if (!hasAnnotations(original) || row.surface !== 'terminal') return { kind: 'text', text: `${drawn}\n${clipLine(original.count)}` }
  return { kind: 'wrapped', text: drawn, hash: found!.hash, count: original.count, annotations: original.annotations }
}
