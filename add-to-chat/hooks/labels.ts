// What the mod draws in its own words and numbers, shared by the pane, the
// rows, the toasts and the selection filter (which must know the pane's
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

/** Where each Source's Excerpt was selected, as the pane says it. */
export const SOURCE_HINT: Record<AnnotationSource, string> = {
  assistant: "from Claude's reply",
  user: 'from your prompt',
  tool: "from a tool's row",
  system: "from Claude Code's own row",
  transcript: 'from the transcript',
}

/** The pane's title, and its tab when other panes are open beside it. */
export const PANE_TITLE = 'Add to chat'
export const ADD_LABEL = '✚ Add to chat'
export const IGNORE_LABEL = '✕ ignore'
/** What the pane's first row says while nothing is selected. */
export const IDLE_HINT = 'Select text in the transcript to add it.'
export const NEEDS_FULLSCREEN_HINT = 'Selections show here in fullscreen (CLAUDE_CODE_NO_FLICKER=1).'
export const PANE_EMPTY = 'Nothing added yet.'
export const COMMENT_LABEL = 'Comment'
export const COMMENT_PLACEHOLDER = 'optional; type and press Enter'
/** The Comment field's submit label; the engine draws it as `⏎ save`. */
export const SAVE_LABEL = 'save'
export const CLOSE_TAB = '✕'
export const SEND_HINT = 'Nothing to type?'
export const SENT_HINT = 'They go with your next prompt ↵'
/** What `[ Send ]` puts in an empty prompt box. */
export const SEND_PLACEHOLDER = '(see annotations)'

export const ALREADY_ADDED = 'That selection is already added'
export const NEEDS_FULLSCREEN = 'add-to-chat needs fullscreen mode (CLAUDE_CODE_NO_FLICKER=1) to read the selection'

export function addedToast(index: number): string {
  return `Added ${circled(index)}: a Comment can go with it in the pane`
}

export function unreadableTemplate(path: string): string {
  return `add-to-chat: cannot read ${path}; using the built-in template`
}

/** `📎 N annotations`: a rewritten prompt row's second line, and the status line. */
export function clipLine(count: number): string {
  return `📎 ${count} annotation${count === 1 ? '' : 's'}`
}

/** Whether a line is a `📎 N annotations` line, or any head of one. */
export function isClipLineHead(line: string): boolean {
  const head = line.trim()
  const count = /^📎 (\d+)/u.exec(head)?.[1]
  return head === '📎' || (count !== undefined && clipLine(Number(count)).startsWith(head))
}

/** One Annotation's tab in the pane: its number and Source. */
export function tabLabel(a: Annotation): string {
  return `${circled(a.index)} ${SOURCE_LABEL[a.source]}`
}

/**
 * Every line of words the pane can draw for this list, but the offer: a
 * selection that matches the offer's preview is the offer's own.
 */
export function paneLines(list: readonly Annotation[]): string[] {
  return [
    ADD_LABEL,
    IGNORE_LABEL,
    IDLE_HINT,
    NEEDS_FULLSCREEN_HINT,
    PANE_EMPTY,
    `${COMMENT_LABEL}: ${COMMENT_PLACEHOLDER} ⏎ ${SAVE_LABEL}`,
    `${SEND_HINT} [ Send ]`,
    SENT_HINT,
    ...list.map(a => `${tabLabel(a)} ${CLOSE_TAB} ${SOURCE_HINT[a.source]}`),
    ...list.map(a => `“${a.text}”`),
    ...list.flatMap(a => (a.comment === undefined ? [] : [`${COMMENT_LABEL}: ${a.comment}`])),
  ]
}
