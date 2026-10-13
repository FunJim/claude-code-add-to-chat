// The Annotation Template: a Mustache subset that turns a prompt and its
// Annotations into what the model reads. No HTML escaping: the output is a
// prompt, not a page.

import type { Annotation } from '../types'

export const DEFAULT_TEMPLATE = `# Response annotations:
Each item contains text selected from earlier in this conversation and where it was selected (\`source.role\`: your replies are \`assistant\`, the user's own prompts \`user\`, tool calls and results \`tool\`, Claude Code's notices \`system\`), and may include the user's note on it (\`annotation\`). Treat items as Annotation 1, Annotation 2, and so on in array order. Use every selection as context and address every note. For every annotation you address, include its inline directive \`:annotation{index="N"}\`, where N is its one-based array position (for example, \`:annotation{index="1"}\`). Do not use unstructured annotation labels.
<response-annotations>
{{annotations_json}}
</response-annotations>

## My request:
{{request}}`

/** A template with `{{request}}` replaces the prompt; one without rides beside it. */
export function usesRequest(template: string): boolean {
  return /\{\{\s*request\s*\}\}/.test(template)
}

type Scope = Record<string, unknown>

type Node =
  | { kind: 'text'; text: string }
  | { kind: 'var'; name: string }
  | { kind: 'section'; name: string; inverted: boolean; body: Node[] }

const TAG = /\{\{\s*([#^/]?)\s*([\w.]+)\s*\}\}/g

/**
 * Splits a template into tags and text, dropping the line a section tag
 * stands on alone (Mustache's standalone rule), so a tag on its own line
 * leaves no blank line behind.
 */
function parse(template: string): Node[] {
  const root: Node[] = []
  const stack: { name: string; body: Node[] }[] = []
  const body = () => stack.at(-1)?.body ?? root
  let at = 0
  for (const m of template.matchAll(TAG)) {
    const [whole, sigil, name] = m as unknown as [string, string, string]
    let start = m.index
    let end = start + whole.length
    if (sigil !== '') {
      const lineStart = template.lastIndexOf('\n', start - 1) + 1
      const nl = template.indexOf('\n', end)
      const lineEnd = nl === -1 ? template.length : nl
      const isAlone = /^[ \t]*$/.test(template.slice(lineStart, start)) && /^[ \t]*$/.test(template.slice(end, lineEnd))
      if (isAlone) {
        start = lineStart
        end = nl === -1 ? lineEnd : nl + 1
      }
    }
    if (start > at) body().push({ kind: 'text', text: template.slice(at, start) })
    at = Math.max(at, end)
    if (sigil === '') {
      body().push({ kind: 'var', name })
    } else if (sigil === '/') {
      if (stack.at(-1)?.name === name) stack.pop()
    } else {
      const node: Node = { kind: 'section', name, inverted: sigil === '^', body: [] }
      body().push(node)
      stack.push({ name, body: node.body })
    }
  }
  if (at < template.length) body().push({ kind: 'text', text: template.slice(at) })
  return root
}

function lookup(scopes: Scope[], name: string): unknown {
  for (let i = scopes.length - 1; i >= 0; i -= 1) {
    if (name in scopes[i]!) return scopes[i]![name]
  }
  return undefined
}

function isTruthy(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : Boolean(value)
}

function renderNodes(nodes: Node[], scopes: Scope[]): string {
  let out = ''
  for (const node of nodes) {
    if (node.kind === 'text') {
      out += node.text
    } else if (node.kind === 'var') {
      const value = lookup(scopes, node.name)
      out += value === undefined || value === null ? '' : String(value)
    } else {
      const value = lookup(scopes, node.name)
      if (node.inverted) {
        if (!isTruthy(value)) out += renderNodes(node.body, scopes)
      } else if (Array.isArray(value)) {
        for (const item of value) out += renderNodes(node.body, [...scopes, item as Scope])
      } else if (isTruthy(value)) {
        out += renderNodes(node.body, typeof value === 'object' ? [...scopes, value as Scope] : scopes)
      }
    }
  }
  return out
}

/** What `{{annotations_json}}` holds per item: Codex's shape, the Comment as `annotation`. */
function toJson(a: Annotation) {
  return { text: a.text, source: { role: a.source, requestId: a.requestId }, annotation: a.comment }
}

/**
 * Compact JSON whose strings cannot close the tags around it: an Excerpt
 * holding `</response-annotations>` would otherwise end the block early and
 * pass its own text off as the person's request. Still valid JSON.
 */
function fencedJson(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
}

export function renderTemplate(template: string, request: string, annotations: readonly Annotation[]): string {
  const scope: Scope = {
    request,
    count: annotations.length,
    annotations_json: fencedJson(annotations.map(toJson)),
    annotations: annotations.map(a => ({
      index: a.index,
      text: a.text,
      source: a.source,
      requestId: a.requestId ?? '',
      comment: a.comment ?? '',
    })),
  }
  return renderNodes(parse(template), [scope])
}
