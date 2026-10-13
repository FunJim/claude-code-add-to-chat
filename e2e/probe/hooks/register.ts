// Test-only plugin loaded beside add-to-chat by the e2e harness: it records,
// as JSON lines in $ATC_PROBE_LOG, what scenarios assert on, and changes
// nothing. It sits beneath add-to-chat, so a prompt it records is the one
// the engine receives.
//
//   session    the session's id (where its transcript is)
//   selection  each change of $.ui.selection()
//   row        each transcript row drawn: component, requestId, text
//   submit     each prompt as it enters: origin, text, context
//   turn       each turn's start and end
//   state      each change of add-to-chat's pending/candidate/commenting
//   toast      each toast add-to-chat raises
//
// Two commands make rows the harness cannot get otherwise: /probe-out
// prints a command's output, /probe-say submits a prompt as a plugin.
import type { EngineInterface, Register } from 'claude-code'

const ROWS = new Set(['UserMessage', 'AssistantMessage', 'ToolUse', 'ToolResult', 'ToolGroup', 'CommandOutput', 'TurnDuration'])

let file: string | undefined
const lines: string[] = []
let writing: Promise<void> = Promise.resolve()
const drawn = new Map<string, string>()
const last: Record<string, string> = {}

/** Rows a resumed session draws come before session.start names the file: they wait in `lines`. */
function log($: EngineInterface, kind: string, data: object) {
  writing = writing.then(async () => {
    lines.push(JSON.stringify({ t: await $.clock.now(), kind, ...data }))
    if (file !== undefined) await $.fs.write(file, `${lines.join('\n')}\n`)
  })
  return writing
}

/** Logs `data` under `kind` when it differs from what was logged last. */
function logChange($: EngineInterface, kind: string, data: object) {
  const key = JSON.stringify(data)
  if (last[kind] === key) return
  last[kind] = key
  void log($, kind, data)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    file = await $.env.get('ATC_PROBE_LOG')
    void log($, 'session', { id: await $.session.id(), cwd: await $.session.cwd() })
    await $.command.register({ name: 'probe-out', description: 'Print a two-line command output (e2e)' })
    await $.command.register({ name: 'probe-say', description: 'Submit a prompt as a plugin (e2e)' })
    $.clock.every(200, async () => {
      logChange($, 'selection', { selection: (await $.ui.selection()) ?? null })
      logChange($, 'state', {
        pending: (await $.state.get({ plugin: 'add-to-chat', key: 'pending' } as never)).value ?? [],
        candidate: (await $.state.get({ plugin: 'add-to-chat', key: 'candidate' } as never)).value ?? null,
        commenting: (await $.state.get({ plugin: 'add-to-chat', key: 'commenting' } as never)).value ?? null,
      })
    })
    return next(e)
  })

  on('command.run', { command: 'probe-out' }, async () => ({
    text: 'PROBE-OUT line one: command output\nPROBE-OUT line two: more output',
  }))

  on('command.run', { command: 'probe-say' }, async $ => {
    // A prompt submitted from inside the command's own dispatch is dropped
    // with it; from a timer it queues as a plugin's prompt does.
    $.clock.after(10, () => void $.prompt.submit({ text: 'PLUGIN-PROMPT: reply with exactly PLUGIN-ACK' }))
    return {}
  })

  on('prompt.submit', async ($, e, next) => {
    const entered = await next(e)
    void log($, 'submit', { origin: e.origin, text: e.text, context: e.context ?? [], dropped: 'drop' in entered })
    return entered
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    void log($, 'turn', { phase: 'start' })
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    void log($, 'turn', { phase: 'complete' })
    return done
  })

  on('ui.copy', async ($, e, next) => {
    void log($, 'copy', { text: (e as { text?: string }).text })
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.toast', async ($, e, next) => {
    void log($, 'toast', { text: e.text })
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', async ($, e, next) => {
    if (!ROWS.has(e.component)) return next(e)
    const props = e.props as { text?: unknown; tool?: unknown; origin?: unknown }
    const row = { component: e.component, requestId: e.requestId, text: typeof props.text === 'string' ? props.text : undefined, tool: props.tool, origin: props.origin }
    const key = JSON.stringify(row)
    if (drawn.get(`${e.component}:${e.requestId}`) !== key) {
      drawn.set(`${e.component}:${e.requestId}`, key)
      void log($, 'row', row)
    }
    return next(e)
  })
}
