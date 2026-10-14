// Test-only plugin loaded beside add-to-chat by the e2e harness: it records,
// as JSON lines in $ATC_PROBE_LOG, what scenarios assert on, and changes
// nothing. It sits beneath add-to-chat, so a prompt it records is the one
// the engine receives.
//
//   session    the session's id (where its transcript is), at start
//   session-id each change of $.session.id() (/branch, /clear…)
//   selection  each change of $.ui.selection()
//   row        each transcript row drawn: component, requestId, text
//   turn       each turn's start and end
//   state      each change of add-to-chat's pending/candidate/paneTab/replyCounts
//   toast      each toast add-to-chat raises
//
// Two commands make rows the harness cannot get otherwise: /probe-out
// prints a command's output, /probe-say submits a prompt as a plugin.
import type { EngineInterface, Register } from 'claude-code'

const ROWS = new Set(['UserMessage', 'AssistantMessage', 'ToolUse', 'ToolResult', 'ToolGroup', 'ToolProgress', 'AskUserQuestion', 'CommandOutput', 'TurnDuration', 'InfoNotice'])

let file: string | undefined
const lines: string[] = []
let writing: Promise<void> = Promise.resolve()
const last = new Map<string, string>()

/** Rows a resumed session draws come before session.start names the file: they wait in `lines`. */
function log($: EngineInterface, kind: string, data: object) {
  writing = writing.then(async () => {
    lines.push(JSON.stringify({ t: await $.clock.now(), kind, ...data }))
    if (file !== undefined) await $.fs.write(file, `${lines.join('\n')}\n`)
  })
  return writing
}

/** Logs `data` under `kind` when it differs from what was logged last for `kind` and `of`. */
function logChange($: EngineInterface, kind: string, data: object, of = '') {
  const value = JSON.stringify(data)
  if (last.get(`${kind}:${of}`) === value) return
  last.set(`${kind}:${of}`, value)
  void log($, kind, data)
}

// add-to-chat's state, read as another plugin may: references of literals.
const PENDING = { plugin: 'add-to-chat', key: 'pending' } as never
const CANDIDATE = { plugin: 'add-to-chat', key: 'candidate' } as never
const PANE_TAB = { plugin: 'add-to-chat', key: 'paneTab' } as never
const REPLY_COUNTS = { plugin: 'add-to-chat', key: 'replyCounts' } as never

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    file = await $.env.get('ATC_PROBE_LOG')
    void log($, 'session', { id: await $.session.id(), cwd: await $.session.cwd() })
    await $.command.register({ name: 'probe-out', description: 'Print a two-line command output (e2e)' })
    await $.command.register({ name: 'probe-say', description: 'Submit a prompt as a plugin (e2e)' })
    $.clock.every(200, async () => {
      const [sessionId, selection, pending, candidate, paneTab, replyCounts] = await Promise.all([
        $.session.id(),
        $.ui.selection(),
        $.state.get(PENDING),
        $.state.get(CANDIDATE),
        $.state.get(PANE_TAB),
        $.state.get(REPLY_COUNTS),
      ])
      logChange($, 'session-id', { id: sessionId })
      logChange($, 'selection', { selection: selection ?? null })
      logChange($, 'state', { pending: pending.value ?? [], candidate: candidate.value ?? null, paneTab: paneTab.value ?? 1, replyCounts: replyCounts.value ?? {} })
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

  on('turn.start', async ($, e, next) => {
    void log($, 'turn', { phase: 'start' })
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    void log($, 'turn', { phase: 'complete' })
    return done
  })

  on('ui.toast', async ($, e, next) => {
    void log($, 'toast', { text: e.text })
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', async ($, e, next) => {
    if (!ROWS.has(e.component)) return next(e)
    const text = (e.props as { text?: unknown }).text
    logChange($, 'row', { component: e.component, requestId: e.requestId, text: typeof text === 'string' ? text : undefined }, `${e.component}:${e.requestId}`)
    return next(e)
  })
}
