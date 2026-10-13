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
  /** The props each row last reached the engine with, by requestId. */
  drawnProps: Record<string, unknown>
  /** Each status line the plugin set, undefined when it cleared it. */
  status: (string | undefined)[]
  /** The ids of the panes open. */
  panes: Set<string>
  /** Prompts the engine's end refuses, as another plugin would. */
  dropWhen?: (text: string) => boolean
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
    drawnProps: {},
    panes: new Set(),
    status: [],
    clock: mock.clock(on),
  }
  on('store.get', ($, e) => ({ value: w.store[e.key] }))
  on('store.set', ($, e) => {
    w.store[e.key] = JSON.parse(JSON.stringify(e.value))
    return { value: undefined }
  })
  on('ui.render', ($, e) => {
    if (e.requestId !== undefined) w.drawnProps[e.requestId] = e.props
    const { Box } = $.ui.resolve(e)
    return h(Box, {}) as RenderElement
  })
  on('ui.selection', () => ({ value: w.selection }))
  on('ui.open', ($, e) => {
    w.panes.add(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', ($, e) => {
    w.panes.delete(e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({ value: [...w.panes].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })) }))
  on('prompt.read', () => ({ value: { text: w.draft, cursor: w.draft.length } }))
  on('ui.status', ($, e) => {
    w.status.push(e.text)
    return { value: undefined }
  })
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
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  // As in a session: a click leaves the keyboard with the prompt.
  on('ui.focus', () => ({ deny: 'that site does not hold the keyboard' }))
  on('prompt.submit', ($, e) => {
    if (w.dropWhen?.(e.text)) return { drop: 'refused' }
    w.submitted.push({ text: e.text, context: e.context })
    return { text: e.text, context: e.context, origin: e.origin }
  })
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  return w
}

/** Draws the band above the prompt, where add-to-chat draws nothing but opens its pane. */
export function drawBand($: Engine, isFullscreen = true) {
  return $.ui.render({ component: 'AbovePrompt', requestId: 'band', surface: 'terminal', viewport: { columns: 120, rows: 40, isFullscreen }, props: BAND.props } as never)
}

/** Mounts the add-to-chat pane, docked beside a fullscreen transcript. */
export function mountPane<P extends 'terminal' | 'desktop' = 'terminal'>($: Engine, surface: P = 'terminal' as P, columns = 60) {
  const props = { title: 'Add to chat', isFocused: false, bodyColumns: columns, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 30 }, view: {} }
  return $.ui.mount({ plugin: 'add-to-chat', surface, component: 'Pane', requestId: 'add-to-chat', props, viewport: { columns: 160, rows: 40, isFullscreen: true } })
}

/** Selects `text`, in row `requestId` if given, and runs /add-to-chat. */
export function addText($: Engine, w: World, text: string, requestId?: string) {
  w.selection = requestId === undefined ? { text } : { text, requestId }
  return runCommand($, w)
}

/** Lets the selection poll run long enough for a selection to settle (a second). */
export async function tick(w: World) {
  for (let i = 0; i < 4; i += 1) await w.clock.advance(250)
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
  return (w.drawnProps[requestId] as { text: string }).text
}
