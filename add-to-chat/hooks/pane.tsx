// The add-to-chat pane: everything the mod shows. Its first row offers the
// selection (or says how to make one); below it, one tab per pending
// Annotation, the open tab showing where its Excerpt came from, the whole
// Excerpt in a frame, and its Comment, which can be edited there; closing a tab removes its
// Annotation. A view: it draws from the values and calls back the actions
// register.tsx hands it.
//
// The first row is always there and always one row high: an offer that
// added a row would move what is under a mouse still dragging. Rows below it
// change on clicks only.
import type { BoxProps, ButtonProps, ElementConstructor, InputProps, RenderElement, TextProps } from 'claude-code'

import type { Annotation, Candidate } from '../types'
import {
  ADD_LABEL,
  CLOSE_TAB,
  COMMENT_LABEL,
  COMMENT_PLACEHOLDER,
  IDLE_HINT,
  IGNORE_LABEL,
  NEEDS_FULLSCREEN_HINT,
  PANE_EMPTY,
  SAVE_LABEL,
  SEND_HINT,
  SENT_HINT,
  MAX_TAB_HOTKEY,
  SOURCE_HINT,
  circled,
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
  pending: readonly Annotation[]
  /** The index of the Annotation whose tab is open. */
  tab: number
  isDraftEmpty: boolean
  /** The fullscreen terminal, the only place a selection reads. */
  isFullscreen: boolean
  /** The cells across the pane's body (`bodyColumns`). */
  columns: number
}

export type PaneActions = {
  add: () => unknown
  ignore: () => unknown
  show: (index: number) => unknown
  remove: (index: number) => unknown
  comment: (index: number, value: string) => unknown
  send: () => unknown
}

/** The tab open for `count` Annotations: `tab`, kept within them. */
export function shownTab(tab: number, count: number): number {
  return Math.min(Math.max(1, tab), count)
}

/**
 * The tab open once Annotation `index` is removed: the same Annotation,
 * renumbered, or where the removed one stood the one that took its place.
 */
export function tabAfterRemoving(tab: number, index: number): number {
  return index < tab ? tab - 1 : tab
}

export function paneView(el: PaneElements, v: PaneValues, act: PaneActions): RenderElement {
  const { Box, Button, Input, Text } = el
  const rule = <Text dimColor>{'─'.repeat(Math.max(1, v.columns))}</Text>

  // The offer, cut to one row: the button, the preview, and the ✕ (just
  // the mark where room is short).
  const ignore = v.columns >= 40 ? IGNORE_LABEL : CLOSE_TAB
  const room = v.columns - (width(ADD_LABEL) + 4) - width(ignore) - 4
  const offer =
    v.offer !== null ? (
      <Box key="offer" gap={1}>
        <Button key="add" variant="primary" label={ADD_LABEL} onPress={act.add} />
        <Text italic wrap="truncate">
          “{preview(v.offer.text, room)}”
        </Text>
        <Button key="ignore" plain onPress={act.ignore}>
          <Text dimColor>{ignore}</Text>
        </Button>
      </Box>
    ) : (
      <Text key="offer" dimColor wrap="truncate">
        {v.isFullscreen ? IDLE_HINT : NEEDS_FULLSCREEN_HINT}
      </Text>
    )

  if (v.pending.length === 0) {
    return (
      <Box flexDirection="column">
        {offer}
        {rule}
        <Text dimColor>{PANE_EMPTY}</Text>
      </Box>
    ) as RenderElement
  }

  const open = v.pending[shownTab(v.tab, v.pending.length) - 1]!
  // A tab is its label, which shows it, and a ✕, which closes it and so
  // removes its Annotation. The first nine answer to their digit, which the
  // terminal draws before the label. The open tab is drawn bold and
  // underlined in the accent color, the others dim.
  const tabs = v.pending.map(a => {
    const show = {
      key: `show-${a.index}`,
      plain: true,
      ...(a.index <= MAX_TAB_HOTKEY ? { hotkey: String(a.index) } : {}),
      onPress: () => act.show(a.index),
    } as const
    return (
      <Box key={`tab-${a.index}`} gap={1}>
        {a.index === open.index ? (
          <Button {...show}>
            <Text color="claude" bold underline>
              {tabLabel(a)}
            </Text>
          </Button>
        ) : (
          <Button {...show} dimColor label={tabLabel(a)} />
        )}
        <Button key={`close-${a.index}`} plain onPress={() => act.remove(a.index)}>
          <Text dimColor>{CLOSE_TAB}</Text>
        </Button>
      </Box>
    )
  })

  return (
    <Box flexDirection="column">
      {offer}
      {rule}
      <Box flexWrap="wrap" columnGap={3}>
        {tabs}
      </Box>
      <Text> </Text>
      <Text>
        <Text color="claude" bold>
          {circled(open.index)}
        </Text>
        <Text dimColor> {SOURCE_HINT[open.source]}</Text>
      </Text>
      <Box borderStyle="round" borderDimColor paddingX={1}>
        <Text wrap="wrap">{open.text}</Text>
      </Box>
      <Input
        key={`comment-${open.index}`}
        label={COMMENT_LABEL}
        placeholder={COMMENT_PLACEHOLDER}
        value={open.comment ?? ''}
        submitLabel={SAVE_LABEL}
        onSubmit={value => act.comment(open.index, value)}
      />
      {rule}
      {v.isDraftEmpty ? (
        <Box key="footer" gap={1}>
          <Button key="send" variant="primary" label="Send" onPress={act.send} />
          <Text dimColor>{SEND_HINT}</Text>
        </Box>
      ) : (
        <Text key="footer" dimColor>
          {SENT_HINT}
        </Text>
      )}
    </Box>
  ) as RenderElement
}
