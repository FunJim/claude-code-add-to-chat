// Deciding what a mouse selection is: an Excerpt worth offering, the pane's
// or the draft's own words, or one already handled. Pure: register.tsx reads
// the selection and the state and acts on the answer.
import type { Annotation, AnnotationSource, Candidate, SelectionNote } from '../types'
import { isSameExcerpt } from './annotations'
import { stripMarks } from './excerpt'
import { isClipLineHead } from './labels'
import { oneLine } from './text'

/** What `$.ui.selection()` gives; a Candidate is one kept to offer. */
export type Selection = Candidate

/** Rows the person types into the session from: a terminal, Remote Control, the SDK. */
const USER_ORIGINS = ['composer', 'bridge', 'sdk']

/** The components a Source is known for, beside the reply and prompt rows. */
export const TOOL_ROWS = ['ToolUse', 'ToolResult', 'ToolGroup', 'ToolProgress', 'AskUserQuestion'] as const
export const SYSTEM_ROWS = ['TurnDuration', 'CommandOutput', 'InfoNotice'] as const

/**
 * The Source of a selection in a row drawn as `component`: a prompt row is
 * the person's only when they typed it; one a notification, a schedule or
 * another session sent is Claude Code's own.
 */
export function rowSource(component: string, props: unknown): AnnotationSource {
  if (component === 'AssistantMessage') return 'assistant'
  if (component === 'UserMessage') {
    const kind = (props as { origin?: { kind?: string } }).origin?.kind ?? ''
    return USER_ORIGINS.includes(kind) ? 'user' : 'system'
  }
  if ((TOOL_ROWS as readonly string[]).includes(component)) return 'tool'
  if ((SYSTEM_ROWS as readonly string[]).includes(component)) return 'system'
  return 'transcript'
}

export function selectionKey(s: Selection): string {
  return `${s.requestId ?? ''}\u0000${s.text}`
}

/**
 * The Excerpt a selection holds: its text with marks and `📎` lines (this
 * mod's own, any head of one) gone; null when nothing is left. Plain JSON,
 * fit for state: no `requestId` key when it lies in no row.
 */
export function excerptOf(s: Selection | undefined): Selection | null {
  if (s === undefined) return null
  const text = stripMarks(s.text)
    .split('\n')
    .filter(line => !isClipLineHead(line))
    .join('\n')
    .trim()
  if (text === '') return null
  return s.requestId === undefined ? { text } : { text, requestId: s.requestId }
}

const flatten = oneLine

/** What the pane and the prompt box hold while a selection is judged. */
export type Surroundings = {
  draft: string
  pending: readonly Annotation[]
  /** `selectionKey` of the selection last added or dismissed. */
  handled: string | null
  /** `selectionKey` of the selection last found outside the transcript: it stays so while the engine reports it. */
  outside: string | null
  /** Every word the pane draws, beyond the offer's preview: a selection of them is the pane's own. */
  paneWords: readonly string[]
  /** What the line under the prompt draws (`lineWords`): a selection's line holding one, or held in one, is that line's. */
  footer: readonly string[]
}

/** The box-drawing characters of a frame or a rule, which a selection across one picks up. */
const FRAME = /[│╭╮╰╯─]/g

/** A rule across the screen, as the prompt box has above and below it. */
function isRule(line: string): boolean {
  return /^\s*─{10,}\s*$/.test(line)
}

/**
 * Whether a selection with no row lies in the prompt box, the pane or the
 * line under the prompt rather than in the transcript: its text is the
 * draft's or the pane's own; or each of its lines is (a drag from the box
 * down into the line under it, over the box's rule), every line below its
 * last rule being under the prompt box.
 */
function isOutsideTranscript(excerpt: Selection, around: Surroundings): boolean {
  if (excerpt.requestId !== undefined) return false
  // A selection across the Excerpt's frame in the pane picks up its border.
  const text = flatten(excerpt.text.replace(FRAME, ' '))
  if (isOwn(text, around)) return true
  const lines = excerpt.text.split('\n')
  const lastRule = lines.findLastIndex(isRule)
  return lines.every((line, i) => {
    const words = flatten(line.replace(FRAME, ' '))
    return words === '' || (lastRule >= 0 && i > lastRule) || isOwn(words, around) || around.footer.some(w => w.includes(words) || (w.length >= 8 && words.includes(w)))
  })
}

/** Whether `text` (flattened) is a piece of the draft or of a line of the pane's. */
function isOwn(text: string, around: Surroundings): boolean {
  return flatten(around.draft).includes(text) || around.paneWords.some(line => flatten(line).includes(text))
}

/** Whether `selection` is where Annotation `a` was added from: its Excerpt, in its row. */
export function isSelectionOf(selection: Selection | undefined, a: { text: string; requestId?: string }): boolean {
  const excerpt = excerptOf(selection)
  return excerpt !== null && isSameExcerpt(excerpt, a)
}

/**
 * An Excerpt to offer, with the key that marks its selection handled; or
 * why not: `nothing` to offer, `outside` the transcript, `pending` as
 * Annotation `index`, or `handled` (just added, or its offer dismissed).
 */
export type Verdict =
  | { excerpt: Selection; key: string }
  | { reason: 'nothing' }
  | { reason: 'outside' }
  | { reason: 'pending'; text: string; index: number }
  | { reason: 'handled' }

/**
 * What to do with a selection: offer (and add) its Excerpt, or not —
 * `nothing` when it holds none, `outside` when it lies outside the
 * transcript (or did when first seen: the engine keeps reporting a
 * selection of the draft after the draft is edited, when it is no longer
 * the draft's text), `pending` when its Excerpt is (same Excerpt, same
 * row), `handled` when it was last added or its offer dismissed.
 */
export function judge(selection: Selection | undefined, around: Surroundings): Verdict {
  const excerpt = excerptOf(selection)
  if (selection === undefined || excerpt === null) return { reason: 'nothing' }
  if (selectionKey(selection) === around.outside || isOutsideTranscript(excerpt, around)) return { reason: 'outside' }
  const added = around.pending.find(a => isSameExcerpt(a, excerpt))
  if (added !== undefined) return { reason: 'pending', text: excerpt.text, index: added.index }
  const key = selectionKey(selection)
  if (key === around.handled) return { reason: 'handled' }
  return { excerpt, key }
}

/** What the pane's first row says of a selection it does not offer: that it is added, as which; nothing else. */
export function noteOf(verdict: Verdict): SelectionNote | null {
  return 'reason' in verdict && verdict.reason === 'pending' ? { text: verdict.text, index: verdict.index } : null
}
