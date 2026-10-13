// What the mod draws in its own words and numbers, shared by the band, the
// rows, the toasts and the selection filter (which must know the band's
// words to tell them from transcript text). A leaf module: the end-to-end
// harness imports it too.
import type { Annotation, AnnotationSource } from '../types'

/** ①–⑳, ㉑–㉟, ㊱–㊿; past fifty, the number in parentheses. */
export function circled(n: number): string {
  if (n >= 1 && n <= 20) return String.fromCodePoint(0x2460 + n - 1)
  if (n >= 21 && n <= 35) return String.fromCodePoint(0x3251 + n - 21)
  if (n >= 36 && n <= 50) return String.fromCodePoint(0x32b1 + n - 36)
  return `(${n})`
}

const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹'

/** `⁽ⁿ⁾`, the mark drawn after an Excerpt in its row. */
export function superscript(n: number): string {
  return `⁽${[...String(n)].map(d => SUPERSCRIPT[Number(d)]).join('')}⁾`
}

export const SOURCE_LABEL: Record<AnnotationSource, string> = { assistant: 'Claude', user: 'You', tool: 'Tool', system: 'System', transcript: 'Transcript' }

/** The accent bar each band row starts with. */
export const BAND_BAR = '▎'
export const ADD_LABEL = '✚ Add to chat'
export const IGNORE_LABEL = '✕ ignore'
export const COMMENT_PLACEHOLDER = 'Add an optional comment… (click here to type, Enter to save)'
export const COMMENT_PLACEHOLDER_SHORT = 'Optional comment (click, Enter saves)'
/** The Comment field's submit label; the engine draws it as `⏎ save`. */
export const SAVE_LABEL = 'save'
export const SEND_HINT = 'nothing to add? '
export const SENT_HINT = 'sent with your next prompt ↵'
export const SENT_HINT_SHORT = '↵ sends them'
/** What the head row says in fullscreen while nothing is selected. */
export const IDLE_HINT = 'select text in the transcript to add it to chat · /add-to-chat'
export const IDLE_HINT_SHORT = 'select text to add it to chat'
/** What `[ Send ]` puts in an empty prompt box. */
export const SEND_PLACEHOLDER = '(see annotations)'

export const ALREADY_ADDED = 'That selection is already added'
export const NOTHING_SELECTED = 'Select text in the transcript first'
export const NEEDS_FULLSCREEN = 'add-to-chat needs fullscreen mode (CLAUDE_CODE_NO_FLICKER=1) to read the selection'

export function addedToast(index: number): string {
  return `Added ${circled(index)} — add an optional comment above the prompt`
}

export function unreadableTemplate(path: string): string {
  return `add-to-chat: cannot read ${path}; using the built-in template`
}

/** `📎 N annotations`: a rewritten prompt row's second line, and the band's count. */
export function clipLine(count: number): string {
  return `📎 ${count} annotation${count === 1 ? '' : 's'}`
}

/** Whether a line is a `📎 N annotations` line, or any head of one. */
export function isClipLineHead(line: string): boolean {
  const head = line.trim()
  const count = /^📎 (\d+)/u.exec(head)?.[1]
  return head === '📎' || (count !== undefined && clipLine(Number(count)).startsWith(head))
}

/** The count chip that opens the list, long and short. */
export function chipLabels(count: number, isListOpen: boolean): [string, string] {
  const arrow = isListOpen ? '▾' : '▸'
  return [`${clipLine(count)} ${arrow}`, `📎 ${count} ${arrow}`]
}

/** Beside the chip: `[ Send ]` for an empty prompt, else a hint; long and short. */
export function sendLabels(isDraftEmpty: boolean): [string, string] {
  return isDraftEmpty ? [`${SEND_HINT}[ Send ]`, '[ Send ]'] : [SENT_HINT, SENT_HINT_SHORT]
}

/** A list row's words, without its padding. */
export function listRowText(a: Annotation): string {
  return `${circled(a.index)} ${SOURCE_LABEL[a.source]} “${a.text}”${a.comment === undefined ? '' : ` — ${a.comment}`}`
}

/**
 * Every line of words the band can draw for this list, but the offer: a
 * selection that matches the offer's preview is the offer's own selection.
 */
export function bandLines(list: readonly Annotation[]): string[] {
  return [
    ADD_LABEL,
    IGNORE_LABEL,
    COMMENT_PLACEHOLDER,
    COMMENT_PLACEHOLDER_SHORT,
    `⏎ ${SAVE_LABEL}`,
    ...sendLabels(true),
    ...sendLabels(false),
    IDLE_HINT,
    IDLE_HINT_SHORT,
    ...chipLabels(list.length, false),
    ...chipLabels(list.length, true),
    ...list.map(listRowText),
  ]
}
