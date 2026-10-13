// Words and colours shared by the band and the selection filter, which must
// know the band's own words to tell them from transcript text.
import type { Color } from 'claude-code'

import type { Annotation, AnnotationSource } from '../types'
import { circled } from './excerpt'

export const SOURCE_LABEL: Record<AnnotationSource, string> = { claude: 'Claude', you: 'You', transcript: 'Transcript' }
export const SOURCE_COLOR: Record<AnnotationSource, Color> = { claude: 'claude', you: 'suggestion', transcript: 'subtle' }

export const ADD_LABEL = '✚ Add to chat'
export const IGNORE_LABEL = '✕ ignore'
export const COMMENT_PLACEHOLDER = 'Add an optional comment… (click here to type, Enter to save)'
export const COMMENT_PLACEHOLDER_SHORT = 'Optional comment (click, Enter saves)'
export const SEND_HINT = 'nothing to add? '
export const SENT_HINT = 'sent with your next prompt ↵'
export const SENT_HINT_SHORT = '↵ sends them'
/** What the head row says in fullscreen while nothing is selected. */
export const IDLE_HINT = 'select text in the transcript to add it to chat · /add-to-chat'
export const IDLE_HINT_SHORT = 'select text to add it to chat'
/** What `[ Send ]` puts in an empty prompt box. */
export const SEND_PLACEHOLDER = '(see annotations)'

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

export function clipLine(count: number): string {
  return `📎 ${plural(count, 'annotation')}`
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
    '⏎ save',
    '▾ hide',
    '▸ show',
    `${SEND_HINT}[ Send ]`,
    SENT_HINT,
    SENT_HINT_SHORT,
    IDLE_HINT,
    IDLE_HINT_SHORT,
    clipLine(list.length),
    `${clipLine(list.length)} ▸`,
    `${clipLine(list.length)} ▾`,
    `📎 ${list.length} ▸`,
    `📎 ${list.length} ▾`,
    '[ Send ]',
    ...list.map(a => `${circled(a.index)} ${SOURCE_LABEL[a.source]} “${a.text}”${a.comment === undefined ? '' : ` — ${a.comment}`}`),
  ]
}
