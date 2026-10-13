// Reading a session's transcript (~/.claude/projects/<cwd>/<id>.jsonl): what
// the model was sent and what it answered.
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

type Block = { type: string; text?: string }
type Entry = {
  type: string
  uuid?: string
  isMeta?: boolean
  message?: { role?: string; content?: string | Block[] }
  attachment?: { type: string; content?: unknown; prompt?: string }
}

/** Claude Code's folder name for a working directory. */
export function projectSlug(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

/** Where Claude Code keeps each working directory's transcripts. */
export const PROJECTS_DIR = join(homedir(), '.claude', 'projects')

export function transcriptPath(cwd: string, sessionId: string): string {
  return join(PROJECTS_DIR, projectSlug(cwd), `${sessionId}.jsonl`)
}

function textOf(content: string | Block[] | undefined): string {
  if (typeof content === 'string') return content
  return (content ?? []).filter(b => b.type === 'text').map(b => b.text ?? '').join('')
}

export type Exchange = {
  /** The user message as stored: what the model read as the prompt. */
  prompt: string
  /** Hidden context a hook attached beside it. */
  context: string[]
  /** The text of the replies that followed, until the next prompt. */
  reply: string
}

export class Transcript {
  readonly path: string

  constructor(path: string) {
    this.path = path
  }

  async entries(): Promise<Entry[]> {
    const text = await readFile(this.path, 'utf8').catch(() => '')
    return text.split('\n').filter(Boolean).map(line => JSON.parse(line) as Entry)
  }

  /** Every prompt the person (or a plugin) sent, with what came with it and after it. */
  async exchanges(): Promise<Exchange[]> {
    const out: Exchange[] = []
    for (const entry of await this.entries()) {
      const isPrompt = entry.type === 'user' && !entry.isMeta && typeof entry.message?.content === 'string'
      if (isPrompt) out.push({ prompt: textOf(entry.message?.content), context: [], reply: '' })
      // A prompt typed mid-turn and folded into it is kept as an attachment.
      if (entry.type === 'attachment' && entry.attachment?.type === 'queued_command' && entry.attachment.prompt !== undefined) {
        out.push({ prompt: entry.attachment.prompt, context: [], reply: '' })
      }
      const current = out.at(-1)
      if (current === undefined) continue
      if (entry.type === 'attachment' && entry.attachment?.type === 'hook_additional_context') {
        const content = entry.attachment.content
        current.context.push(...(Array.isArray(content) ? content.map(String) : [String(content)]))
      }
      if (entry.type === 'assistant') current.reply += textOf(entry.message?.content)
    }
    return out
  }

  /** The exchange whose prompt contains `marker`. */
  async exchange(marker: string): Promise<Exchange | undefined> {
    return (await this.exchanges()).findLast(x => x.prompt.includes(marker) || x.context.some(c => c.includes(marker)))
  }
}

/** The JSON array between <response-annotations> tags of the default template. */
export function annotationsJson(prompt: string): unknown[] | undefined {
  const match = /<response-annotations>\n([\s\S]*?)\n<\/response-annotations>/.exec(prompt)
  return match === null ? undefined : (JSON.parse(match[1]!) as unknown[])
}
