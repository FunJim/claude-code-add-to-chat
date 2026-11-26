// The line under the prompt: Claude Code's own hint as it draws it, and on
// that same row, while the pane is closed, the offer for the selection
// (✚ Add to chat, its preview, a ✕ that dismisses it); under it, while
// Annotations are pending, `📎 N annotations · show pane`, a toggle of the
// pane (`· hide pane` while it is drawn). A view: register.tsx hands it the
// engine's drawing (`next(e)`).
//
// The offer never adds a row: it comes while the mouse may still be
// dragging, and a row more under the prompt moves the transcript and the
// prompt up under it ([ADR 0015](../../docs/adr/0015-the-offer-takes-no-row.md)).
// The count row comes and goes on clicks and sends only.
import type { BoxProps, ButtonProps, ElementConstructor, RenderElement, TextProps } from 'claude-code'

import { ADD_LABEL, CLOSE_TAB, hintLabel } from './labels'
import { preview, width } from './text'

export type PromptHintElements = {
  Box: ElementConstructor<BoxProps>
  Button: ElementConstructor<ButtonProps>
  Text: ElementConstructor<TextProps>
}

export type PromptHintValues = {
  count: number
  isPaneDrawn: boolean
  /** The offer's Excerpt, while there is one (shown only while the pane is not drawn). */
  offer: string | null
  /** The cells across the line. */
  columns: number
  /** Claude Code's line as it draws it (`PromptHint`'s `hint`): the offer goes beside it, in the cells it leaves. */
  hint: string
}

/** Where a floating Box's `left` counts from: the row's indent, two cells in. */
const ROW_INDENT = 2
/** The button's cells as the terminal draws a primary one: `[ ✚ Add to chat ]`. */
const BUTTON_CELLS = width(ADD_LABEL) + 4
/** The cells the offer takes but for its preview's text: the button, its quotes, the ✕ and the gaps between. */
const OFFER_CHROME = BUTTON_CELLS + 1 + 2 + 1 + width(CLOSE_TAB)
/**
 * The cells Claude Code's line may take beyond `hint`, which leaves out what
 * leads it: its indent and the permission mode's label
 * (`⏵⏵ bypass permissions on `, the longest), and a gap before the offer.
 */
const HINT_RESERVE = ROW_INDENT + 26 + 3
/** The fewest cells of preview worth drawing; with fewer the offer goes without one. */
const MIN_PREVIEW = 6
/** The cells kept clear at the line's right end. */
const RIGHT_MARGIN = 1

/**
 * Where the offer fits on Claude Code's row under the prompt: at its right
 * end `beside` the hint, with a preview cut to the cells left (none when
 * under `MIN_PREVIEW` are), `left` cells in; where even the button and ✕
 * would reach the hint, `instead` of the hint while the offer stands. One
 * row either way: the offer never adds one.
 */
export function offerFit(columns: number, hint: string, offer: string): { at: 'beside'; preview: string | null; left: number } | { at: 'instead'; preview: string } {
  const free = columns - width(hint) - HINT_RESERVE - RIGHT_MARGIN
  const quoted = free - OFFER_CHROME >= MIN_PREVIEW ? preview(offer, free - OFFER_CHROME) : null
  const cells = quoted === null ? BUTTON_CELLS + 1 + width(CLOSE_TAB) : OFFER_CHROME + width(quoted)
  if (cells <= free) return { at: 'beside', preview: quoted, left: columns - ROW_INDENT - RIGHT_MARGIN - cells }
  // Claude Code keeps the permission mode's label ahead of the row's own cells.
  return { at: 'instead', preview: preview(offer, Math.max(MIN_PREVIEW, columns - HINT_RESERVE - OFFER_CHROME - RIGHT_MARGIN)) }
}

/**
 * What the line under the prompt draws that a selection may take: Claude
 * Code's hint as last drawn, and the offer's button. (Its count row is a
 * 📎 line, which no Excerpt keeps.)
 */
export function lineWords(hint: string): string[] {
  const button = `[ ${ADD_LABEL} ]`
  return hint.trim() === '' ? [button] : [hint, button]
}

/** The offer: the same the pane's first row carries (its button, preview and ✕), one row high. */
function offerParts(el: PromptHintElements, quoted: string | null, add: () => unknown, dismiss: () => unknown) {
  const { Button, Text } = el
  return [
    <Button key="hint-add" variant="primary" label={ADD_LABEL} onPress={add} />,
    quoted === null ? null : (
      <Text key="hint-preview" italic wrap="truncate">
        “{quoted}”
      </Text>
    ),
    <Button key="hint-dismiss" plain onPress={dismiss}>
      <Text dimColor>{CLOSE_TAB}</Text>
    </Button>,
  ]
}

export function promptHint(
  el: PromptHintElements,
  engine: RenderElement,
  v: PromptHintValues,
  act: { toggle: () => unknown; add: () => unknown; dismiss: () => unknown },
): RenderElement {
  const { Box, Button } = el
  // Claude Code draws its row first; what the hook adds stacks under it. So
  // a Box of no height there floats the offer one row up, onto that row.
  let line: RenderElement | null = engine
  let float: RenderElement | null = null
  if (v.offer !== null && !v.isPaneDrawn) {
    const fit = offerFit(v.columns, v.hint, v.offer)
    const parts = offerParts(el, fit.preview, act.add, act.dismiss)
    if (fit.at === 'beside') {
      float = (
        <Box key="hint-float" height={0}>
          <Box key="hint-offer" position="absolute" top={-1} left={fit.left} gap={1}>
            {parts}
          </Box>
        </Box>
      ) as RenderElement
    } else {
      line = (
        <Box key="hint-offer" gap={1}>
          {parts}
        </Box>
      ) as RenderElement
    }
  }
  const clip =
    v.count === 0 ? null : (
      <Box key="hint-clip-row" paddingLeft={2}>
        <Button key="hint-clip" plain dimColor label={hintLabel(v.count, v.isPaneDrawn)} onPress={act.toggle} />
      </Box>
    )
  return (
    <Box flexDirection="column">
      {line}
      {float}
      {clip}
    </Box>
  ) as RenderElement
}
