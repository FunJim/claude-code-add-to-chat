// A stand-in for the Anthropic Messages API on a local port, so a run calls
// no model: Claude Code is pointed at it (`ANTHROPIC_BASE_URL`) and gets
// scripted, streamed replies. The script reads what a scenario sends:
//   - a request to read a file: a Read call, then the file's text as written;
//   - a request to run a bash command in backticks: a Bash call, then "Done.";
//   - Annotations in the turn: one sentence per Annotation, each ending with
//     its Citation;
//   - a compaction: a summary; a title or a prompt suggestion: a short one;
//   - anything else: "OK."
// Whether the model *understands* the template is not tested here: that is
// `--model haiku`'s part.
import { appendFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

import { sleep } from './exec.ts'

export type Block = { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }

type Part = { type: string; text?: string; content?: unknown; id?: string; name?: string; tool_use_id?: string }
type Message = { role: string; content: string | Part[] }
export type MessagesRequest = { model?: string; system?: string | Part[]; messages?: Message[]; tools?: unknown[]; stream?: boolean }

function partsOf(m: Message | undefined): Part[] {
  if (m === undefined) return []
  return typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content
}

/** A tool result's text, whatever shape its content takes. */
function resultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map(c => (typeof c?.text === 'string' ? c.text : '')).join('')
  return ''
}

function textOf(parts: readonly Part[]): string {
  return parts
    .filter(p => p.type === 'text')
    .map(p => p.text ?? '')
    .join('\n')
}

/** A file's text as the Read tool returns it: numbered lines, and maybe a reminder after them. */
export function fileText(result: string): string {
  return result
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .split('\n')
    .map(line => line.replace(/^\s*\d+\t/, ''))
    .join('\n')
    .trim()
}

/** The sentences answering a turn's Annotations, each ending with its Citation. */
export function citing(turn: string): string | undefined {
  const indexes = [...turn.matchAll(/<annotation index="(\d+)"[^>]*>([\s\S]*?)<\/annotation>/g)]
  if (indexes.length === 0) return undefined
  return indexes
    .map(([, index, body]) => `${body!.includes('<comment>') ? 'This answers your comment on it' : 'Noted what this one says'} :annotation{index="${index}"}`)
    .join('\n\n')
}

let calls = 0
const callId = () => `toolu_mock_${(calls += 1)}`

/** The reply to one request: the script above. */
export function replyTo(body: MessagesRequest): Block[] {
  const messages = body.messages ?? []
  const last = messages.findLast(m => m.role === 'user')
  const lastParts = partsOf(last)
  const said = textOf(lastParts)
  const system = typeof body.system === 'string' ? body.system : textOf(body.system ?? [])
  const all = [system, ...messages.map(m => [textOf(partsOf(m)), ...partsOf(m).map(p => resultText(p.content))].join('\n'))].join('\n')
  // The turn: what came since the last reply (the prompt, its context, tool results).
  const lastReply = messages.findLastIndex(m => m.role === 'assistant')
  const turn = messages
    .slice(lastReply + 1)
    .map(m => textOf(partsOf(m)))
    .join('\n')
  const text = (t: string): Block[] => [{ type: 'text', text: t }]

  if (said.startsWith('[SUGGESTION MODE')) return text('')
  if (said.includes('create a detailed summary of the conversation')) {
    return text('<analysis>A test conversation.</analysis>\n<summary>The user had a file read back and asked about parts of the reply.</summary>')
  }
  if (!body.tools?.length) return text('Mock session')

  const cited = citing(turn)
  const result = lastParts.find(p => p.type === 'tool_result')
  if (result !== undefined) {
    if (cited !== undefined) return text(cited)
    const call = partsOf(messages[lastReply]).find(p => p.type === 'tool_use' && p.id === result.tool_use_id)
    return text(call?.name === 'Read' ? fileText(resultText(result.content)) : 'Done.')
  }

  const command = said.match(/run the bash command `([^`]+)`/)?.[1]
  if (command !== undefined) return [{ type: 'tool_use', id: callId(), name: 'Bash', input: { command, description: 'Run the requested command' } }]
  const file = said.match(/\bRead (\S+\.\w+)/)?.[1]
  const cwd = all.match(/Primary working directory: (\S+)/)?.[1]
  if (file !== undefined && cwd !== undefined) return [{ type: 'tool_use', id: callId(), name: 'Read', input: { file_path: `${cwd}/${file}` } }]
  return text(cited ?? 'OK.')
}

/** `text` in pieces of about `size` characters, the way a reply streams. */
export function chunks(text: string, size = 24): string[] {
  const out: string[] = []
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size))
  return out
}

/** Headers safe to keep in the request log: never a key or a token. */
function loggable(headers: IncomingMessage['headers']) {
  return Object.fromEntries(Object.entries(headers).filter(([k]) => !/auth|key|cookie|token/i.test(k)))
}

export class MockModel {
  private readonly log: string
  private server: Server | undefined
  private requests = 0

  /** `log`: a JSONL file of the requests it answered. */
  constructor(log: string) {
    this.log = log
  }

  /** Listens on a free local port; resolves the base URL. */
  async start(): Promise<string> {
    const server = createServer((req, res) => void this.answer(req, res).catch(() => res.destroy()))
    this.server = server
    // Nothing of the mock's keeps the run alive: the scenarios end it.
    server.on('connection', socket => socket.unref())
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    server.unref()
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  }

  async stop() {
    const server = this.server
    if (server === undefined) return
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }

  private async answer(req: IncomingMessage, res: ServerResponse) {
    let raw = ''
    for await (const chunk of req) raw += chunk
    const body = (raw === '' ? {} : JSON.parse(raw)) as MessagesRequest
    const path = (req.url ?? '').split('?')[0]
    const requestId = `req_mock_${(this.requests += 1)}`
    const json = (status: number, value: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json', 'request-id': requestId })
      res.end(JSON.stringify(value))
    }
    if (path === '/v1/messages/count_tokens') return json(200, { input_tokens: Math.ceil(raw.length / 4) })
    if (path !== '/v1/messages') return json(404, { type: 'error', error: { type: 'not_found_error', message: `the mock model has no ${path}` } })

    const blocks = replyTo(body)
    await appendFile(this.log, `${JSON.stringify({ requestId, headers: loggable(req.headers), request: body, reply: blocks })}\n`)
    const stop = blocks.some(b => b.type === 'tool_use') ? 'tool_use' : 'end_turn'
    const usage = { input_tokens: Math.ceil(raw.length / 4), output_tokens: 0 }
    const message = { id: `msg_mock_${this.requests}`, type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage }
    if (!body.stream) return json(200, { ...message, content: blocks, stop_reason: stop })

    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'request-id': requestId })
    const send = async (type: string, data: object) => {
      res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`)
      await sleep(15)
    }
    await send('message_start', { message })
    for (const [index, b] of blocks.entries()) {
      if (b.type === 'text') {
        await send('content_block_start', { index, content_block: { type: 'text', text: '' } })
        for (const piece of chunks(b.text)) await send('content_block_delta', { index, delta: { type: 'text_delta', text: piece } })
      } else {
        await send('content_block_start', { index, content_block: { ...b, input: {} } })
        await send('content_block_delta', { index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(b.input) } })
      }
      await send('content_block_stop', { index })
    }
    await send('message_delta', { delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 8 } })
    await send('message_stop', {})
    res.end()
  }
}
