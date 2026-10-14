// Sent prompts' Annotations: read back from a rewritten prompt, and listed
// for the pane's history.
import type { Annotation, AnnotationSource, Original } from '../types'
import { hashText } from './hash'

const BLOCK = /<response-annotations>\n([\s\S]*?)\n<\/response-annotations>/

const SOURCES: readonly string[] = ['assistant', 'user', 'tool', 'system', 'transcript']

/**
 * The Annotations of a prompt rewritten by a template holding
 * `<response-annotations>` and `{{annotations_json}}` (the default does);
 * undefined for any other text. The JSON's `<>&` are escaped, so an Excerpt
 * cannot end the block early.
 */
export function historyOf(text: string): Annotation[] | undefined {
  const json = BLOCK.exec(text)?.[1]
  if (json === undefined) return undefined
  try {
    const items = JSON.parse(json) as { text?: unknown; source?: { role?: unknown; requestId?: unknown }; annotation?: unknown }[]
    if (!Array.isArray(items) || items.some(it => typeof it?.text !== 'string')) return undefined
    return items.map((it, i) => {
      const role = typeof it.source?.role === 'string' && SOURCES.includes(it.source.role) ? it.source.role : 'transcript'
      return {
        index: i + 1,
        text: it.text as string,
        source: role as AnnotationSource,
        ...(typeof it.source?.requestId === 'string' ? { requestId: it.source.requestId } : {}),
        ...(typeof it.annotation === 'string' ? { comment: it.annotation } : {}),
      }
    })
  } catch {
    return undefined
  }
}

/**
 * The rewritten prompts in a transcript (its user messages, as
 * `$.session.messages()` gives them), by the hash `originals` is keyed by,
 * oldest first; each once.
 */
export function promptsIn(messages: readonly { role: string; text: string }[], originals: Record<string, Original>): string[] {
  const hashes = messages.filter(m => m.role === 'user').map(m => hashText(m.text))
  return [...new Set(hashes.filter(h => originals[h] !== undefined))]
}

/** A sent prompt the pane's history lists. */
export type SentPrompt = { hash: string; text: string; annotations: Annotation[] }

/** The prompts of this conversation whose Annotations are known, newest first. */
export function sentPrompts(originals: Record<string, Original>, inSession: readonly string[]): SentPrompt[] {
  return inSession
    .flatMap(hash => {
      const o = originals[hash]
      return o?.annotations !== undefined && o.annotations.length > 0 ? [{ hash, text: o.text, annotations: o.annotations }] : []
    })
    .reverse()
}
