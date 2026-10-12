// Throwaway: answers docs/spec.md "待实测". Logs to /tmp/atc-probe/log.jsonl.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ProbeSel } from '../types'

const LOG = '/tmp/atc-probe/log.jsonl'
const sel = atom({ plugin: 'atc-probe', key: 'sel' } as const, null as ProbeSel)
const presses = atom({ plugin: 'atc-probe', key: 'presses' } as const, 0)

const lines: string[] = []
let chain: Promise<void> = Promise.resolve()
const seen = new Map<string, string>()
const poll = { n: 0, total: 0, max: 0 }
let timer: { cancel: () => void } | undefined
let lastDraft = ''

function log($: EngineInterface, kind: string, data: object) {
  chain = chain.then(async () => {
    lines.push(JSON.stringify({ t: await $.clock.now(), kind, ...data }))
    await $.fs.write(LOG, lines.join('\n') + '\n')
  })
  return chain
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'probe-sel', description: 'Log the current selection' })
    timer?.cancel()
    timer = $.clock.every(250, async () => {
      const t0 = await $.clock.now()
      const s = (await $.ui.selection()) ?? null
      const dt = (await $.clock.now()) - t0
      poll.n += 1
      poll.total += dt
      poll.max = Math.max(poll.max, dt)
      if (poll.n % 40 === 0) void log($, 'poll-stats', { ...poll, avg: poll.total / poll.n })
      const prev = await read($, sel)
      if (JSON.stringify(prev) !== JSON.stringify(s)) {
        void log($, 'sel-change', { sel: s })
        await update($, sel, () => s)
      }
      const draft = (await $.prompt.read()).text
      if (draft !== lastDraft) {
        lastDraft = draft
        void log($, 'draft', { draft })
      }
    })
    void log($, 'session.start', {})
    return next(e)
  })

  on('command.run', { command: 'probe-sel' }, async $ => {
    const s = await $.ui.selection()
    void log($, 'command-sel', { sel: s ?? null })
    return { text: `probe: ${JSON.stringify(s ?? null).slice(0, 200)}` }
  })

  on('prompt.submit', async ($, e, next) => {
    void log($, 'prompt.submit', { text: e.text, origin: e.origin, context: e.context ?? null, wait: e.wait })
    if (e.text.includes('#rw')) {
      const text = `# Response annotations:\n<response-annotations>\n[]\n</response-annotations>\n\n## My request:\n${e.text}`
      const r = await next({ ...e, text })
      void log($, 'prompt.submit-result', { result: r })
      return r
    }
    if (e.text.includes('#ctx')) return next({ ...e, context: [...(e.context ?? []), 'PROBE CONTEXT BLOCK'] })
    return next(e)
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const key = `u:${e.requestId}`
    const v = JSON.stringify([e.props.text, e.props.isExpanded])
    if (seen.get(key) !== v) {
      seen.set(key, v)
      void log($, 'UserMessage', { requestId: e.requestId, text: e.props.text, origin: e.props.origin, isExpanded: e.props.isExpanded })
    }
    return next(e)
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const key = `a:${e.requestId}`
    if (seen.get(key) !== e.props.text) {
      seen.set(key, e.props.text)
      void log($, 'AssistantMessage', { requestId: e.requestId, text: e.props.text, isFirstOfReply: e.props.isFirstOfReply })
    }
    if (e.props.text.includes('MARKTEST')) {
      return next({ ...e, props: { ...e.props, text: e.props.text.replace('MARKTEST', 'MARKTEST⁽¹⁾') } })
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, sel)
    const n = await read($, presses)
    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box>
        <Button
          key="probe"
          label="Probe"
          onPress={async () => {
            const at = await $.ui.selection()
            void log($, 'press-sel', { sel: at ?? null })
            await update($, presses, k => k + 1)
          }}
        />
        <Button
          key="send"
          label="Send"
          onPress={async () => {
            $.clock.after(10, async () => {
              const r = await $.prompt.submit({ text: '(timer) #rw reply with just TIMER' })
              void log($, 'send-result', { result: r })
            })
          }}
        />
        <Text dimColor>
          {' '}presses={n} sel={s ? JSON.stringify(s).slice(0, 60) : 'none'}
        </Text>
      </Box>
    )
  })
}
