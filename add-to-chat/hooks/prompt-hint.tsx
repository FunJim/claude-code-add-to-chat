// The line under the prompt: Claude Code's own hint as it draws it, and under
// it, while the pane is closed, the offer for the selection (✚ Add to chat,
// its preview, a ✕ that dismisses it), and while Annotations are pending
// `📎 N annotations · show pane`, a toggle of the pane (`· hide pane` while
// it is drawn). A view: register.tsx hands it the engine's drawing (`next(e)`).
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
}

/** The line's offer row: the same offer the pane's first row carries (its button, preview and ✕), one row high. */
function offerRow(el: PromptHintElements, offer: string, columns: number, add: () => unknown, dismiss: () => unknown) {
  const { Box, Button, Text } = el
  const room = Math.max(8, columns - width(ADD_LABEL) - width(CLOSE_TAB) - 8)
  return (
    <Box key="hint-offer-row" gap={1} paddingLeft={2}>
      <Button key="hint-add" variant="primary" label={ADD_LABEL} onPress={add} />
      <Text italic wrap="truncate">
        “{preview(offer, room)}”
      </Text>
      <Button key="hint-dismiss" plain onPress={dismiss}>
        <Text dimColor>{CLOSE_TAB}</Text>
      </Button>
    </Box>
  )
}

export function promptHint(
  el: PromptHintElements,
  engine: RenderElement,
  v: PromptHintValues,
  act: { toggle: () => unknown; add: () => unknown; dismiss: () => unknown },
): RenderElement {
  const { Box, Button } = el
  const offer = v.offer === null || v.isPaneDrawn ? null : offerRow(el, v.offer, v.columns, act.add, act.dismiss)
  const clip =
    v.count === 0 ? null : (
      <Box key="hint-clip-row" paddingLeft={2}>
        <Button key="hint-clip" plain dimColor label={hintLabel(v.count, v.isPaneDrawn)} onPress={act.toggle} />
      </Box>
    )
  return (
    <Box flexDirection="column">
      {engine}
      {offer}
      {clip}
    </Box>
  ) as RenderElement
}
