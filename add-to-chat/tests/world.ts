// What sits beneath the plugin in a test: the selection, the prompt box,
// toasts and the engine's end of a submit.
import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, PromptChangeInput, PromptSubmitInput, RenderElement } from 'claude-code'

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
  /** The ids of the panes open. */
  panes: Set<string>
  /** The session's id, and its transcript's messages (a submit adds the prompt). */
  sessionId: string
  messages: { role: 'user' | 'assistant'; text: string; toolUses: [] }[]
  /** Prompts the engine's end refuses, as another plugin would. */
  dropWhen?: (text: string) => boolean
  clock: ReturnType<typeof mock.clock>
}

/** The README's example of a template without `{{request}}`. */
export const XML_TEMPLATE = `The user selected these excerpts from earlier in the conversation; their prompt refers to them by number.
<annotations>
{{annotations_xml}}
</annotations>
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

export async function start($: Engine, on: On, store: Record<string, unknown> = {}, transcript: readonly string[] = []): Promise<World> {
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
    sessionId: 's1',
    messages: transcript.map(text => ({ role: 'user' as const, text, toolUses: [] as [] })),
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
  on('ui.toast', ($, e) => {
    w.toasts.push(e.text)
    return { value: undefined }
  })
  on('prompt.change', ($, e) => ({ text: e.text }))
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
  on('session.id', () => ({ value: w.sessionId }))
  on('turn.complete', ($, e) => e as never)
  on('session.messages', () => ({ value: w.messages }) as never)
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  // As in a session: a click leaves the keyboard with the prompt.
  on('ui.focus', () => ({ deny: 'that site does not hold the keyboard' }))
  on('prompt.submit', ($, e) => {
    if (w.dropWhen?.(e.text)) return { drop: 'refused' }
    w.submitted.push({ text: e.text, context: e.context })
    w.messages.push({ role: 'user', text: e.text, toolUses: [] })
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

/** The prompt box changed by no edit, as Claude Code raises it: a step through the prompt history, or `engine` (a rewind putting a prompt back). */
export function changeBox($: Engine, w: World, text: string, origin: 'history' | 'engine') {
  w.draft = text
  // Raised by the engine alone, so not among the calls the kit types on `$`.
  const prompt = $.prompt as unknown as { change: (e: PromptChangeInput) => Promise<unknown> }
  return prompt.change({ text, cursor: text.length, origin: { kind: origin } })
}

/** Mounts the hint line under the prompt, an empty draft and no turn running. */
export function mountHint<P extends 'terminal' | 'desktop' = 'terminal'>($: Engine, surface: P = 'terminal' as P) {
  const props = { isDraft: false, isWorking: false, hint: '? for shortcuts' }
  return $.ui.mount({ plugin: 'add-to-chat', surface, component: 'PromptHint', requestId: 'prompt-hint', props, viewport: { columns: 120, rows: 40, isFullscreen: true } })
}

/** Mounts a sent prompt row typed in the composer, to read and press what the plugin draws there. */
export function mountPrompt<P extends 'terminal' | 'desktop' = 'terminal'>($: Engine, requestId: string, text: string, surface: P = 'terminal' as P) {
  const props = { text, origin: { kind: 'composer' as const }, isExpanded: false }
  return $.ui.mount({ plugin: 'add-to-chat', surface, component: 'UserMessage', requestId, props, viewport: { columns: 120, rows: 40, isFullscreen: true } })
}

/** Ends a turn: the main loop's, or with `agentId` a subagent's. */
export function endTurn($: Engine, agentId?: string) {
  return $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'end_turn', text: '', ...(agentId === undefined ? {} : { agentId }) } as never)
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
