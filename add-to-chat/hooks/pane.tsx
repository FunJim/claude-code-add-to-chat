// The add-to-chat pane: everything the mod shows. Its first row offers the
// selection (or says how to make one); below it, one of three views:
// - pending: one tab per pending Annotation, the open tab showing where its
//   Excerpt came from, the whole Excerpt in a frame, and its Comment, which
//   can be edited there; closing a tab removes its Annotation;
// - history: the prompts sent with Annotations, newest first;
// - sent: one of them, its Annotations in tabs, read-only.
// A view: it draws from the values and calls back the actions register.tsx
// hands it.
//
// The first row is always there and always one row high: an offer that
// added a row would move what is under a mouse still dragging. Rows below it
// change on clicks only.
import type { BoxProps, ButtonProps, ElementConstructor, InputProps, RenderElement, TextProps } from 'claude-code'

import type { Annotation, Candidate, PaneMode, SelectionNote } from '../types'
import type { SentPrompt } from './history'
import {
  ADD_LABEL,
  BACK_LABEL,
  CLOSE_TAB,
  COMMENT_LABEL,
  COMMENT_PLACEHOLDER,
  HISTORY_EMPTY,
  HISTORY_TITLE,
  IDLE_HINT,
  JUMP_ROW_LABEL,
  MAX_TAB_HOTKEY,
  NEEDS_FULLSCREEN_HINT,
  NO_COMMENT,
  PANE_EMPTY,
  SAVE_LABEL,
  SEND_BUTTON,
  SEND_HINT,
  SENT_HINT,
  SENT_TITLE,
  SOURCE_HINT,
  addedNote,
  circled,
  clipLine,
  historyRowLabel,
  drawnTab,
  sourceLine,
  tabLabel,
} from './labels'
import { preview, width } from './text'

/** The pane's id: what opens, closes and draws it. */
export const PANE_ID = 'add-to-chat'

/** The cells across to ask for when the pane docks beside the transcript. */
export const PANE_COLUMNS = 56

/** The elements the pane draws with, from `$.ui.resolve(e)`. */
export type PaneElements = {
  Box: ElementConstructor<BoxProps>
  Button: ElementConstructor<ButtonProps>
  Input: ElementConstructor<InputProps>
  Text: ElementConstructor<TextProps>
}

export type PaneValues = {
  offer: Candidate | null
  /** The selection reported, not offered as its Excerpt is pending: the row says as which. */
  note: SelectionNote | null
  pending: readonly Annotation[]
  /** The index of the Annotation whose tab is open. */
  tab: number
  /** Comments saved with Enter so far: the field's key (`commentKey`). */
  commentSaves: number
  isDraftEmpty: boolean
  /** The fullscreen terminal, the only place a selection reads. */
  isFullscreen: boolean
  /** The cells across the pane's body (`bodyColumns`). */
  columns: number
  mode: PaneMode
  /** The prompts sent with Annotations, newest first. */
  sent: readonly SentPrompt[]
  /** Whether the sent prompt shown has a row to jump to. */
  canJump: boolean
}

export type PaneActions = {
  add: () => unknown
  /** The offer's ✕: not this time. */
  dismiss: () => unknown
  show: (index: number) => unknown
  remove: (index: number) => unknown
  /** The Comment field's text, at each edit. */
  draft: (index: number, value: string) => unknown
  /** The Comment field's text, at Enter. */
  comment: (index: number, value: string) => unknown
  send: () => unknown
  openHistory: () => unknown
  openSent: (hash: string) => unknown
  showSent: (index: number) => unknown
  back: () => unknown
  jump: () => unknown
}

/**
 * The key of Annotation `index`'s Comment field after `saves` saves. The
 * terminal empties a field on Enter and keeps its text by key, filling it
 * again only with another value: a new key after each save draws the field
 * anew, holding the Comment.
 */
export function commentKey(index: number, saves: number): string {
  return `comment-${index}-${saves}`
}

/** The tab open for `count` Annotations: `tab`, kept within them. */
export function shownTab(tab: number, count: number): number {
  return Math.min(Math.max(1, tab), count)
}

/** The sent prompt the mode shows, if it is one the history knows. */
export function shownSent(mode: PaneMode, sent: readonly SentPrompt[]): SentPrompt | undefined {
  return mode.kind === 'sent' ? sent.find(p => p.hash === mode.hash) : undefined
}

/**
 * Every line of words the pane can draw in this state, but the offer: a
 * selection that matches the offer's preview is the offer's own, of the
 * transcript. The view draws these words and the selection rule ignores
 * them, from this one list: adding words to `paneView` means adding them
 * here, where they sit beside it. (The pending view's words count whatever
 * the mode: the pane switches modes in a click, and they are its own.)
 */
export function ownWords(v: PaneWords): string[] {
  const pending = [
    ADD_LABEL,
    IDLE_HINT,
    NEEDS_FULLSCREEN_HINT,
    PANE_EMPTY,
    `${COMMENT_LABEL}: ${COMMENT_PLACEHOLDER} ⏎ ${SAVE_LABEL}`,
    `[ ${SEND_BUTTON} ] ${SEND_HINT}`,
    SENT_HINT,
    historyRowLabel(v.sent.length),
    ...v.pending.map(a => `${drawnTab(a)} ${CLOSE_TAB}`),
    ...v.pending.map(a => addedNote(a.index)),
    ...v.pending.map(sourceLine),
    ...v.pending.map(a => a.text),
    ...v.pending.flatMap(a => (a.comment === undefined ? [] : [`${COMMENT_LABEL}: ${a.comment}`])),
  ]
  const beside = [BACK_LABEL, HISTORY_TITLE, HISTORY_EMPTY, SENT_TITLE, NO_COMMENT, JUMP_ROW_LABEL]
  if (v.mode.kind === 'history') return [...pending, ...beside, ...v.sent.flatMap(p => [p.text, clipLine(p.annotations.length)])]
  const shown = shownSent(v.mode, v.sent)
  if (shown === undefined) return [...pending, ...beside]
  return [
    ...pending,
    ...beside,
    shown.text,
    ...shown.annotations.flatMap(a => [tabLabel(a), `${circled(a.index)} ${SOURCE_HINT[a.source]}`, a.text, ...(a.comment === undefined ? [] : [`${COMMENT_LABEL}: ${a.comment}`])]),
  ]
}

/** What the pane is showing, for its own words (see `ownWords`). */
export type PaneWords = { mode: PaneMode; pending: readonly Annotation[]; sent: readonly SentPrompt[] }

/**
 * A row of tabs, one per Annotation: its label, which shows it, and (when
 * `remove` is given) a ✕, which closes it and so removes its Annotation. The
 * first nine answer to their digit, which the terminal draws before the
 * label. The open tab is drawn bold and underlined in the accent color, the
 * others dim.
 */
function tabRow(el: PaneElements, list: readonly Annotation[], open: number, prefix: string, show: (index: number) => unknown, remove?: (index: number) => unknown) {
  const { Box, Button, Text } = el
  const tabs = list.map(a => {
    const press = {
      key: `${prefix}show-${a.index}`,
      plain: true,
      ...(a.index <= MAX_TAB_HOTKEY ? { hotkey: String(a.index) } : {}),
      onPress: () => show(a.index),
    } as const
    return (
      <Box key={`${prefix}tab-${a.index}`} gap={1}>
        {a.index === open ? (
          <Button {...press}>
            <Text color="claude" bold underline>
              {tabLabel(a)}
            </Text>
          </Button>
        ) : (
          <Button {...press} dimColor label={tabLabel(a)} />
        )}
        {remove === undefined ? null : (
          <Button key={`close-${a.index}`} plain onPress={() => remove(a.index)}>
            <Text dimColor>{CLOSE_TAB}</Text>
          </Button>
        )}
      </Box>
    )
  })
  return (
    <Box flexWrap="wrap" columnGap={3}>
      {tabs}
    </Box>
  )
}

/** Where an Annotation's Excerpt came from, and the Excerpt in a frame. */
function excerptBlock(el: PaneElements, a: Annotation) {
  const { Box, Text } = el
  return [
    <Text key="source">
      <Text color="claude" bold>
        {circled(a.index)}
      </Text>
      <Text dimColor> {SOURCE_HINT[a.source]}</Text>
    </Text>,
    <Box key="excerpt" borderStyle="round" borderDimColor paddingX={1}>
      <Text wrap="wrap">{a.text}</Text>
    </Box>,
  ]
}

export function paneView(el: PaneElements, v: PaneValues, act: PaneActions): RenderElement {
  const { Box, Button, Input, Text } = el
  const rule = (key: string) => (
    <Text key={key} dimColor>
      {'─'.repeat(Math.max(1, v.columns))}
    </Text>
  )

  // The offer, cut to one row: the button, the preview, and the ✕ that
  // dismisses it. With none, that the selection is added (as which), or
  // the hint.
  const room = v.columns - (width(ADD_LABEL) + 4) - width(CLOSE_TAB) - 4
  const noteWords = v.note === null ? '' : addedNote(v.note.index)
  const offer =
    v.offer !== null ? (
      <Box key="offer" gap={1}>
        <Button key="add" variant="primary" label={ADD_LABEL} onPress={act.add} />
        <Text italic wrap="truncate">
          “{preview(v.offer.text, room)}”
        </Text>
        <Button key="dismiss" plain onPress={act.dismiss}>
          <Text dimColor>{CLOSE_TAB}</Text>
        </Button>
      </Box>
    ) : v.note !== null ? (
      <Text key="offer" dimColor wrap="truncate">
        “{preview(v.note.text, Math.max(8, v.columns - width(noteWords) - 4))}” {noteWords}
      </Text>
    ) : (
      <Text key="offer" dimColor wrap="truncate">
        {v.isFullscreen ? IDLE_HINT : NEEDS_FULLSCREEN_HINT}
      </Text>
    )

  const header = (title: string) => (
    <Box key="header" gap={2}>
      <Button key="back" plain label={BACK_LABEL} onPress={act.back} />
      <Text bold wrap="truncate">
        {title}
      </Text>
    </Box>
  )

  if (v.mode.kind === 'history') {
    // One row per prompt, its first nine answering to their digit.
    const room = v.columns - 3 - width(clipLine(99)) - 2
    return (
      <Box flexDirection="column">
        {offer}
        {rule('rule')}
        {header(HISTORY_TITLE)}
        <Text> </Text>
        {v.sent.length === 0 ? (
          <Text dimColor>{HISTORY_EMPTY}</Text>
        ) : (
          v.sent.map((p, i) => (
            <Button
              key={`sent-${p.hash}`}
              plain
              {...(i < MAX_TAB_HOTKEY ? { hotkey: String(i + 1) } : {})}
              onPress={() => act.openSent(p.hash)}
            >
              {preview(p.text, room)} <Text dimColor>{clipLine(p.annotations.length)}</Text>
            </Button>
          ))
        )}
      </Box>
    ) as RenderElement
  }

  if (v.mode.kind === 'sent') {
    const shown = shownSent(v.mode, v.sent)
    if (shown === undefined) {
      return (
        <Box flexDirection="column">
          {offer}
          {rule('rule')}
          {header(HISTORY_TITLE)}
          <Text dimColor>{HISTORY_EMPTY}</Text>
        </Box>
      ) as RenderElement
    }
    const open = shown.annotations[shownTab(v.mode.tab, shown.annotations.length) - 1]!
    return (
      <Box flexDirection="column">
        {offer}
        {rule('rule')}
        {header(`${SENT_TITLE} “${preview(shown.text, Math.max(8, v.columns - width(BACK_LABEL) - width(SENT_TITLE) - 6))}”`)}
        <Text> </Text>
        {tabRow(el, shown.annotations, open.index, 'sent-', act.showSent)}
        <Text> </Text>
        {excerptBlock(el, open)}
        {open.comment === undefined ? (
          <Text dimColor>{NO_COMMENT}</Text>
        ) : (
          <Text wrap="wrap">
            <Text dimColor>{COMMENT_LABEL}: </Text>
            {open.comment}
          </Text>
        )}
        {rule('rule-foot')}
        {v.canJump ? <Button key="jump" plain label={JUMP_ROW_LABEL} onPress={act.jump} /> : null}
      </Box>
    ) as RenderElement
  }

  // The way into the history, under the pending view, once there is one.
  const historyRow =
    v.sent.length === 0 ? null : <Button key="history" plain dimColor label={historyRowLabel(v.sent.length)} onPress={act.openHistory} />

  if (v.pending.length === 0) {
    return (
      <Box flexDirection="column">
        {offer}
        {rule('rule')}
        <Text dimColor>{PANE_EMPTY}</Text>
        {historyRow === null ? null : <Text> </Text>}
        {historyRow}
      </Box>
    ) as RenderElement
  }

  const open = v.pending[shownTab(v.tab, v.pending.length) - 1]!
  return (
    <Box flexDirection="column">
      {offer}
      {rule('rule')}
      {tabRow(el, v.pending, open.index, '', act.show, act.remove)}
      <Text> </Text>
      {excerptBlock(el, open)}
      <Input
        key={commentKey(open.index, v.commentSaves)}
        label={COMMENT_LABEL}
        placeholder={COMMENT_PLACEHOLDER}
        value={open.comment ?? ''}
        submitLabel={SAVE_LABEL}
        onInput={value => act.draft(open.index, value)}
        onSubmit={value => act.comment(open.index, value)}
      />
      {rule('rule-foot')}
      {v.isDraftEmpty ? (
        <Box key="footer" gap={1}>
          <Button key="send" variant="primary" label={SEND_BUTTON} onPress={act.send} />
          <Text dimColor>{SEND_HINT}</Text>
        </Box>
      ) : (
        <Text key="footer" dimColor>
          {SENT_HINT}
        </Text>
      )}
      {historyRow}
    </Box>
  ) as RenderElement
}
