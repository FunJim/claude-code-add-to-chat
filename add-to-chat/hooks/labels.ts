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
export const COMMENT_PLACEHOLDER = 'Add an optional comment…'
/** The Comment field's submit label; the engine draws it as `⏎ save`. */
export const SAVE_LABEL = 'save'
export const CLOSE_TAB = '✕'
/** Beside `[ Send ]`, while the prompt box is empty. */
export const SEND_HINT = 'now, or type a prompt and press ↵'
export const SENT_HINT = 'They go with your next prompt ↵'
/** What `[ Send ]` puts in an empty prompt box. */
export const SEND_PLACEHOLDER = '(see annotations)'

/** The pane's way to the sent prompts' Annotations, and back. */
export function historyLabel(count: number): string {
  return `History (${count})`
}
export const BACK_LABEL = '← back'
export const HISTORY_TITLE = 'Sent with annotations'
export const HISTORY_EMPTY = 'No prompt sent with annotations yet.'
export const SENT_TITLE = 'You sent'
export const NO_COMMENT = 'No comment'
export const JUMP_LABEL = 'jump to prompt'
export const NOT_DRAWN = 'That prompt is not drawn yet: scroll to it once, then jump'

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

/** The button under a rewritten prompt row that opens its Annotations in the pane. */
export function clipButtonLabel(count: number): string {
  return `${clipLine(count)} ↗`
}

/** Whether a line is a `📎 N annotations` line (or its button), or any head of one. */
export function isClipLineHead(line: string): boolean {
  const head = line.trim().replace(/\s*↗$/u, '')
  const count = /^📎 (\d+)/u.exec(head)?.[1]
  return head === '📎' || (count !== undefined && clipLine(Number(count)).startsWith(head))
}

/** The highest tab number a digit key shows. */
export const MAX_TAB_HOTKEY = 9

/**
 * One Annotation's tab label in the pane: its Source. The terminal draws a
 * hotkey's digit before it (`1: Claude`); past nine the label carries the
 * number itself.
 */
export function tabLabel(a: Annotation): string {
  return a.index <= MAX_TAB_HOTKEY ? SOURCE_LABEL[a.source] : `${a.index}: ${SOURCE_LABEL[a.source]}`
}

/** A tab as the terminal draws it, hotkey digit included: `1: Claude`. */
export function drawnTab(a: Annotation): string {
  return a.index <= MAX_TAB_HOTKEY ? `${a.index}: ${tabLabel(a)}` : tabLabel(a)
}

/** The open tab's first line: the number its marks carry in the transcript, and where it was selected. */
export function sourceLine(a: Annotation): string {
  return `${circled(a.index)} ${SOURCE_HINT[a.source]}`
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
    `[ Send ] ${SEND_HINT}`,
    SENT_HINT,
    ...list.map(a => `${drawnTab(a)} ${CLOSE_TAB}`),
    ...list.map(sourceLine),
    ...list.map(a => a.text),
    ...list.flatMap(a => (a.comment === undefined ? [] : [`${COMMENT_LABEL}: ${a.comment}`])),
  ]
}
