// The line under the prompt while the pane is not drawn: Claude Code's own
// hint as it draws it, and under it `📎 N annotations ↗`, which opens the
// pane. A view: register.tsx hands it the engine's drawing (`next(e)`).
import type { BoxProps, ButtonProps, ElementConstructor, RenderElement } from 'claude-code'

import { clipButtonLabel } from './labels'

export type PromptHintElements = {
  Box: ElementConstructor<BoxProps>
  Button: ElementConstructor<ButtonProps>
}

export function promptHint(el: PromptHintElements, engine: RenderElement, count: number, open: () => unknown): RenderElement {
  const { Box, Button } = el
  return (
    <Box flexDirection="column">
      {engine}
      <Box key="hint-clip-row" paddingLeft={2}>
        <Button key="hint-clip" plain dimColor label={clipButtonLabel(count)} onPress={open} />
      </Box>
    </Box>
  ) as RenderElement
}
