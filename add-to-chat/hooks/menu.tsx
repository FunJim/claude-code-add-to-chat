// The desktop app's right-click menu on selected transcript text: one row,
// `✚ Add to chat`, the Excerpt's preview the line under it. A view:
// register.tsx decides whether the selection gets one and what a pick does.
import type { ButtonProps, ElementConstructor, RenderElement, TextProps } from 'claude-code'

import { ADD_LABEL } from './labels'
import { preview } from './text'

export type MenuElements = {
  Button: ElementConstructor<ButtonProps>
  Text: ElementConstructor<TextProps>
}

/** The menu's key for the row: what a press names. */
export const MENU_ROW_KEY = 'add-to-chat'

/** How much of the Excerpt the row's second line shows, in cells. */
const MENU_PREVIEW = 60

export function menuRow(el: MenuElements, excerpt: string, add: () => unknown): RenderElement {
  const { Button, Text } = el
  return (
    <Button key={MENU_ROW_KEY} label={ADD_LABEL} onPress={add}>
      {ADD_LABEL}
      <Text dimColor>“{preview(excerpt, MENU_PREVIEW)}”</Text>
    </Button>
  ) as RenderElement
}
