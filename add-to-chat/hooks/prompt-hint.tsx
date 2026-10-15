// The line under the prompt while Annotations are pending: Claude Code's
// own hint as it draws it, and under it `📎 N annotations · show pane`, a
// toggle of the pane (`· hide pane` while it is drawn). A view: register.tsx
// hands it the engine's drawing (`next(e)`).
import type { BoxProps, ButtonProps, ElementConstructor, RenderElement } from 'claude-code'

import { hintLabel } from './labels'

export type PromptHintElements = {
  Box: ElementConstructor<BoxProps>
  Button: ElementConstructor<ButtonProps>
}

export function promptHint(el: PromptHintElements, engine: RenderElement, count: number, isPaneDrawn: boolean, toggle: () => unknown): RenderElement {
  const { Box, Button } = el
  return (
    <Box flexDirection="column">
      {engine}
      <Box key="hint-clip-row" paddingLeft={2}>
        <Button key="hint-clip" plain dimColor label={hintLabel(count, isPaneDrawn)} onPress={toggle} />
      </Box>
    </Box>
  ) as RenderElement
}
