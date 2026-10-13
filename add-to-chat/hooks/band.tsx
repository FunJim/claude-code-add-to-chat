// The band above the prompt: the offer to add the selection, the Comment
// field, and the pending Annotations with their count. A view: it draws
// from the values and calls back the actions register.tsx hands it.
//
// In the fullscreen terminal its head row is always there, one row high
// whatever the selection: a band that grew when text got selected would push
// the transcript up under a mouse still dragging, and the drag's end would
// land a row lower. Rows below it come and go on clicks only.
import type { BoxProps, ButtonProps, Color, ElementConstructor, InputProps, RenderChildren, RenderElement, TextProps } from 'claude-code'

import type { Annotation, AnnotationSource, Candidate } from '../types'
import {
  ADD_LABEL,
  BAND_BAR,
  COMMENT_PLACEHOLDER,
  COMMENT_PLACEHOLDER_SHORT,
  IDLE_HINT,
  IDLE_HINT_SHORT,
  IGNORE_LABEL,
  SAVE_LABEL,
  SEND_HINT,
  SOURCE_LABEL,
  chipLabels,
  circled,
  sendLabels,
} from './labels'
import { preview, width } from './text'

const SOURCE_COLOR: Record<AnnotationSource, Color> = { assistant: 'claude', user: 'suggestion', tool: 'subtle', system: 'subtle', transcript: 'subtle' }

/** The elements the band draws with, from `$.ui.resolve(e)`. */
export type BandElements = {
  Box: ElementConstructor<BoxProps>
  Button: ElementConstructor<ButtonProps>
  Input: ElementConstructor<InputProps>
  Text: ElementConstructor<TextProps>
}

export type BandValues = {
  offer: Candidate | null
  pending: readonly Annotation[]
  commenting: number | null
  isListOpen: boolean
  isDraftEmpty: boolean
  /** The fullscreen terminal: where selections read, and the head row stays. */
  isFullscreen: boolean
  /** The cells the band's tree is laid out in (`bodyColumns`). */
  columns: number
  /** The rows it may take before the engine scrolls it (`maxRows`). */
  maxRows: number
}

export type BandActions = {
  add: () => unknown
  ignore: () => unknown
  comment: (index: number, value: string) => unknown
  remove: (index: number) => unknown
  toggleList: () => unknown
  send: () => unknown
}

/** The band's tree; undefined when it has nothing to show. */
export function bandView(el: BandElements, v: BandValues, act: BandActions): RenderElement | undefined {
  if (!v.isFullscreen && v.offer === null && v.pending.length === 0 && v.commenting === null) return undefined
  const { Box, Button, Input, Text } = el
  // The accent bar and the space beside it take two cells.
  const room = v.columns - 2

  // Each row leads with the accent bar. Children go in as a list: a
  // Fragment inside a Box breaks the row's layout.
  const row = (key: string, children: RenderChildren[], spread = false) => (
    <Box key={key}>
      <Text color="claude">{BAND_BAR} </Text>
      <Box width={room} justifyContent={spread ? 'space-between' : 'flex-start'}>
        {children}
      </Box>
    </Box>
  )

  // The head row: the offer (or a hint) at the left, the count at the
  // right; cut to fit, never wrapped, so it stays one row. Where room is
  // short the right side and the ✕ shrink first, so the preview keeps some.
  const count = v.pending.length
  const [send, sendShort] = sendLabels(v.isDraftEmpty)
  const [chip, chipShort] = chipLabels(count, v.isListOpen)
  const layouts =
    count === 0
      ? [{ chip: '', send: '', ignore: IGNORE_LABEL }, { chip: '', send: '', ignore: '✕' }]
      : [
          { chip, send, ignore: IGNORE_LABEL },
          { chip, send: sendShort, ignore: IGNORE_LABEL },
          { chip: chipShort, send: sendShort, ignore: IGNORE_LABEL },
          { chip: chipShort, send: sendShort, ignore: '✕' },
        ]
  const addWidth = width(ADD_LABEL) + 4 // drawn as [ label ]
  const fits = (l: (typeof layouts)[number]) => {
    const right = l.chip === '' ? 0 : width(l.chip) + 1 + width(l.send) + 2
    return { ...l, right, preview: room - right - addWidth - width(l.ignore) - 6 }
  }
  const head0 = layouts.map(fits).find(l => l.preview >= 12) ?? fits(layouts.at(-1)!)
  const hintRoom = room - head0.right - 1
  const head = row(
    'head',
    [
      v.offer !== null ? (
        <Box gap={1}>
          <Button key="add" variant="primary" label={ADD_LABEL} onPress={act.add} />
          <Text italic>“{preview(v.offer.text, head0.preview)}”</Text>
          <Button key="ignore" plain onPress={act.ignore}>
            <Text dimColor>{head0.ignore}</Text>
          </Button>
        </Box>
      ) : v.isFullscreen ? (
        <Text dimColor>{preview(hintRoom >= width(IDLE_HINT) ? IDLE_HINT : IDLE_HINT_SHORT, hintRoom)}</Text>
      ) : (
        <Text> </Text>
      ),
      count === 0 ? null : (
        <Box gap={1}>
          <Button key="list" plain onPress={act.toggleList}>
            <Text bold>{head0.chip}</Text>
          </Button>
          {v.isDraftEmpty ? (
            <Box>
              {head0.send.startsWith(SEND_HINT) ? <Text dimColor>{SEND_HINT}</Text> : null}
              <Button key="send" variant="primary" label="Send" onPress={act.send} />
            </Box>
          ) : (
            <Text dimColor>{head0.send}</Text>
          )}
        </Box>
      ),
    ],
    true,
  )

  const editing = v.commenting
  const commentRow =
    editing !== null &&
    row('comment', [
      // The field takes what room there is; the number keeps its own.
      <Box flexShrink={0}>
        <Text color="claude" bold>
          {circled(editing)}{' '}
        </Text>
      </Box>,
      <Input
        key={`comment-${editing}`}
        placeholder={room >= 72 ? COMMENT_PLACEHOLDER : COMMENT_PLACEHOLDER_SHORT}
        submitLabel={SAVE_LABEL}
        autoFocus
        onSubmit={value => act.comment(editing, value)}
      />,
    ])

  const listRows = v.pending.map(a => {
    const label = SOURCE_LABEL[a.source].padEnd(11)
    const comment = a.comment === undefined ? '' : ` — ${a.comment}`
    return row(
      `row-${a.index}`,
      [
        <Text>
          {'  '}
          <Text color="claude" bold>
            {circled(a.index)}
          </Text>{' '}
          <Text color={SOURCE_COLOR[a.source]}>{label}</Text>
          <Text italic>“{preview(a.text, room - label.length - width(comment) - 12)}”</Text>
          <Text dimColor>{comment}</Text>
        </Text>,
        <Button key={`remove-${a.index}`} plain onPress={() => act.remove(a.index)}>
          <Text dimColor>✕</Text>
        </Button>,
      ],
      true,
    )
  })

  // A short terminal leaves the band few rows, and past them the engine
  // spends one on "n more". The head and the Comment field show first (with
  // one row, the field while it is open); the list goes under them only with
  // a row to spare, scrolling if long.
  const fit = Math.max(1, v.maxRows)
  const core = [head, commentRow].filter(r => r !== false)
  const shown = fit === 1 && commentRow !== false ? [commentRow] : core.slice(0, fit)
  const rows = v.isListOpen && core.length < fit ? [...shown, ...listRows] : shown

  return (<Box flexDirection="column">{rows}</Box>) as RenderElement
}
