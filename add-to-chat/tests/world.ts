// What sits beneath the plugin in a test: the selection, the prompt box,
// toasts and the engine's end of a submit.
import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, PromptSubmitInput, RenderElement } from 'claude-code'

export type World = {
  selection?: { text: string; requestId?: string }
  draft: string
  isFullscreen: boolean
  toasts: string[]
  fills: string[]
  submitted: { text: string; context?: readonly string[] }[]
  files: Record<string, string>
  store: Record<string, unknown>
  /** The text each transcript row last reached the engine with, by requestId. */
  drawn: Record<string, string>
  clock: ReturnType<typeof mock.clock>
}

/** The README's example of a template without `{{request}}`. */
export const XML_TEMPLATE = `The user selected these excerpts from earlier in the conversation; their prompt refers to them by number.
{{#annotations}}
<annotation n="{{index}}" source="{{source}}">
<excerpt>{{text}}</excerpt>
{{#comment}}<comment>{{comment}}</comment>{{/comment}}
</annotation>
{{/annotations}}
`

export const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 12,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 11 },
    view: {},
  },
} as const

export async function start($: Engine, on: On, store: Record<string, unknown> = {}): Promise<World> {
  const w: World = {
    draft: '',
    isFullscreen: true,
    toasts: [],
    fills: [],
    submitted: [],
    files: {},
    store: { ...store },
    drawn: {},
    clock: mock.clock(on),
  }
  on('store.get', ($, e) => ({ value: w.store[e.key] }))
  on('store.set', ($, e) => {
    w.store[e.key] = JSON.parse(JSON.stringify(e.value))
    return { value: undefined }
  })
  on('ui.render', ($, e) => {
    const props = e.props as { text?: unknown }
    if (e.requestId !== undefined && typeof props.text === 'string') w.drawn[e.requestId] = props.text
    const { Box } = $.ui.resolve(e)
    return h(Box, {}) as RenderElement
  })
  on('ui.selection', () => ({ value: w.selection }))
  on('prompt.read', () => ({ value: { text: w.draft, cursor: w.draft.length } }))
  on('ui.toast', ($, e) => {
    w.toasts.push(e.text)
    return { value: undefined }
  })
  on('prompt.fill', ($, e) => {
    w.fills.push(e.text)
    w.draft = e.text
    return { isFilled: true }
  })
  on('fs.read', ($, e) => {
    const text = w.files[e.path]
    return text === undefined ? { deny: `ENOENT: ${e.path}` } : { value: text }
  })
  on('env.get', ($, e) => ({ value: e.name === 'HOME' ? '/home/me' : undefined }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  // As in a session: a click leaves the keyboard with the prompt.
  on('ui.focus', () => ({ deny: 'that site does not hold the keyboard' }))
  on('prompt.submit', ($, e) => {
    w.submitted.push({ text: e.text, context: e.context })
    return { text: e.text, context: e.context, origin: e.origin }
  })
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  return w
}

/** Lets the selection poll run once. */
export async function tick(w: World) {
  await w.clock.advance(250)
}

export function submit($: Engine, text: string) {
  const e: PromptSubmitInput = { text, origin: { kind: 'composer' }, wait: false }
  return $.prompt.submit(e)
}

export function runCommand($: Engine, w: World) {
  return $.command.run({
    command: 'add-to-chat',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: w.isFullscreen, columns: 120 },
  })
}

/** Draws a transcript row through the plugin and returns the text the engine would draw. */
export async function drawRow(
  $: Engine,
  w: World,
  component: 'AssistantMessage' | 'UserMessage',
  requestId: string,
  text: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const props =
    component === 'AssistantMessage'
      ? { text, isFirstOfReply: true, ...extra }
      : { text, origin: { kind: 'composer' }, isExpanded: false, ...extra }
  await $.ui.render({ component, requestId, surface: 'terminal', props } as never)
  return w.drawn[requestId]!
}
