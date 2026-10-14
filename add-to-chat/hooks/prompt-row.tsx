// A rewritten prompt row in the terminal: Claude Code's own drawing of the
// prompt as typed, and under it a row of the mod's: `📎 N annotations ↗`,
// which opens them in the pane, and a card listing them that shows while
// the pointer is over that row. A view: register.tsx hands it the engine's
// drawing (`next(e)`), so the row keeps Claude Code's look and theme.
import type { BoxProps, ButtonProps, ElementConstructor, RenderElement, TextProps } from 'claude-code'

import type { Annotation } from '../types'
import { SOURCE_LABEL, circled, clipButtonLabel } from './labels'
import { preview } from './text'

/** The most Annotations the card lists; the rest it counts. */
export const CARD_MAX = 6

/**
 * The card's background: opaque, or the rows beneath show through its blank
 * cells. The theme's prompt-row background, which Claude Code draws a sent
 * prompt on.
 */
export const CARD_BACKGROUND = 'userMessageBackground'

export type PromptRowElements = {
  Box: ElementConstructor<BoxProps>
  Button: ElementConstructor<ButtonProps>
  Text: ElementConstructor<TextProps>
}

export type PromptRowValues = {
  /** `hashText` of the rewritten prompt: the row's keys. */
  hash: string
  count: number
  /** Its Annotations: the card lists them. */
  annotations: readonly Annotation[]
  /** The cells across the terminal. */
  columns: number
}

/** The card's rows: one per Annotation listed, and one counting the rest. */
export function cardRows(count: number): number {
  return Math.min(count, CARD_MAX) + (count > CARD_MAX ? 1 : 0)
}

export function promptRow(el: PromptRowElements, engine: RenderElement, v: PromptRowValues, open: () => unknown): RenderElement {
  const { Box, Button, Text } = el
  const listed = v.annotations.slice(0, CARD_MAX)
  const room = Math.max(16, Math.min(64, v.columns - 24))
  // Above the button, over the prompt and the rows before it: a card below
  // would be painted over by the rows drawn after this one.
  const card =
    listed.length === 0 ? null : (
      <Box
        position="absolute"
        top={-(cardRows(v.annotations.length) + 2)}
        left={0}
        display="none"
        hover={{ display: 'flex' }}
        flexDirection="column"
        borderStyle="round"
        borderDimColor
        paddingX={1}
        backgroundColor={CARD_BACKGROUND}
      >
        {listed.map(a => (
          <Text key={`card-${a.index}`} wrap="truncate">
            <Text color="claude" bold>
              {circled(a.index)}
            </Text>{' '}
            <Text dimColor>{SOURCE_LABEL[a.source]}</Text> “{preview(a.text, room)}”
            {a.comment === undefined ? null : <Text dimColor> — {preview(a.comment, Math.max(8, Math.floor(room / 2)))}</Text>}
          </Text>
        ))}
        {v.annotations.length > CARD_MAX ? <Text dimColor>{`+${v.annotations.length - CARD_MAX} more`}</Text> : null}
      </Box>
    )
  return (
    <Box flexDirection="column">
      {engine}
      <Box key={`clip-row-${v.hash}`} paddingLeft={2}>
        <Button key={`clip-${v.hash}`} plain dimColor label={clipButtonLabel(v.count)} onPress={open} />
        {card}
      </Box>
    </Box>
  ) as RenderElement
}
