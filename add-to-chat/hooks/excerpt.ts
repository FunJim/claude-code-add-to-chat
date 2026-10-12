// Finding an Excerpt (rendered text, as a mouse copy takes it) inside a row's
// markdown, and drawing numbered marks into that markdown. See
// docs/spikes.md §2 for why matching goes through a projection.

/** How a row's markdown is drawn: replies render links, prompts keep them raw. */
export type RowKind = 'assistant' | 'user'

/** Marks this mod draws; they come along when the person selects over them. */
const MARK_CHARS = /[⁽⁾⁰¹²³⁴⁵⁶⁷⁸⁹①-⑳]/g
const MARK_CHAR = /[⁽⁾⁰¹²³⁴⁵⁶⁷⁸⁹①-⑳]/
const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹'

export function stripMarks(text: string): string {
  return text.replace(MARK_CHARS, '')
}

export function circled(n: number): string {
  return n >= 1 && n <= 20 ? String.fromCodePoint(0x2460 + n - 1) : `(${n})`
}

export function superscript(n: number): string {
  return `⁽${[...String(n)].map(d => SUPERSCRIPT[Number(d)]).join('')}⁾`
}

/** A mark drawn in the terminal's inline-code colour. */
function codeMark(mark: string): string {
  return `\`${mark}\``
}

type Projection = {
  /** The text as drawn. */
  plain: string
  /** Markdown offset of each plain character. */
  map: number[]
  /** Whether each plain character lies in a fenced code block. */
  inFence: boolean[]
  /** Markdown offset just past each code span's closing backticks, by the span's last content offset + 1. */
  spanEnds: Set<number>
  /** Whether each plain character lies in a code span. */
  inSpan: boolean[]
  /** Markdown offsets where a closing delimiter starts, mapped to where it ends. */
  closers: Map<number, number>
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/

/**
 * Projects markdown onto the text the terminal draws for it, keeping each
 * drawn character's offset in the markdown.
 */
export function project(md: string, kind: RowKind): Projection {
  const out: Projection = { plain: '', map: [], inFence: [], inSpan: [], spanEnds: new Set(), closers: new Map() }
  const chars: string[] = []
  const emit = (c: string, at: number, fence = false, span = false) => {
    chars.push(c)
    out.map.push(at)
    out.inFence.push(fence)
    out.inSpan.push(span)
  }
  const open: string[] = []
  let fence: string | null = null
  let i = 0
  while (i < md.length) {
    const atLineStart = i === 0 || md[i - 1] === '\n'
    if (atLineStart) {
      const lineEnd = md.indexOf('\n', i) === -1 ? md.length : md.indexOf('\n', i)
      const f = FENCE.exec(md.slice(i, lineEnd))
      if (f !== null && (fence === null || f[1]!.startsWith(fence))) {
        fence = fence === null ? f[1]! : null
        i = lineEnd + 1
        continue
      }
      if (fence === null && kind === 'assistant') {
        const block = /^ {0,3}(#{1,6} +|> ?)/.exec(md.slice(i, lineEnd))
        if (block !== null) i += block[0].length
      }
    }
    if (fence !== null) {
      emit(md[i]!, i, true)
      i += 1
      continue
    }
    const c = md[i]!
    if (MARK_CHAR.test(c)) {
      i += 1
      continue
    }
    if (c === '\\' && kind === 'assistant' && /[\\`*_~[\]()#>!-]/.test(md[i + 1] ?? '')) {
      emit(md[i + 1]!, i + 1)
      i += 2
      continue
    }
    if (c === '`') {
      const run = /^`+/.exec(md.slice(i))![0]
      const close = md.indexOf(run, i + run.length)
      if (close !== -1) {
        for (let j = i + run.length; j < close; j += 1) {
          if (!MARK_CHAR.test(md[j]!)) emit(md[j]!, j, false, true)
        }
        out.spanEnds.add(close)
        out.closers.set(close, close + run.length)
        i = close + run.length
        continue
      }
    }
    if (kind === 'assistant' && c === '[') {
      const link = /^\[([^\]\n]*)\]\([^)\s]*(?: +"[^"]*")?\)/.exec(md.slice(i))
      if (link !== null) {
        const text = link[1]!
        for (let j = 0; j < text.length; j += 1) emit(text[j]!, i + 1 + j)
        const tail = i + 1 + text.length
        out.closers.set(tail, i + link[0].length)
        i += link[0].length
        continue
      }
    }
    const isIntraword = c === '_' && /\w/.test(md[i - 1] ?? '') && /\w/.test(md[i + 1] ?? '')
    if (c === '*' || c === '~' || (c === '_' && kind === 'assistant' && !isIntraword)) {
      const run = new RegExp(`^\\${c}+`).exec(md.slice(i))![0]
      if (open.at(-1) === run) {
        open.pop()
        out.closers.set(i, i + run.length)
      } else {
        open.push(run)
      }
      i += run.length
      continue
    }
    emit(c, i)
    i += 1
  }
  out.plain = chars.join('')
  return out
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

type Placement = { at: number; isInCode: boolean }

/**
 * Where to insert a mark right after the first occurrence of `excerpt` in
 * `md`: past any delimiter the match closes, so the mark never lands inside a
 * link or splits a code span; `isInCode` when it still ends mid-span, where a
 * bare mark takes the span's colour. Undefined when it is not found or ends
 * in a code block.
 */
export function markOffset(md: string, excerpt: string, kind: RowKind): number | undefined {
  return place(md, excerpt, kind)?.at
}

function place(md: string, excerpt: string, kind: RowKind): Placement | undefined {
  const words = stripMarks(excerpt).split(/\s+/).filter(Boolean)
  if (words.length === 0) return undefined
  const p = project(md, kind)
  const found = new RegExp(words.map(escapeRegExp).join('\\s+')).exec(p.plain)
  if (found === null) return undefined
  const last = found.index + found[0].length - 1
  if (p.inFence[last]) return undefined
  let at = p.map[last]! + 1
  const isInCode = p.inSpan[last]! && !p.spanEnds.has(at)
  if (!isInCode) for (let end = p.closers.get(at); end !== undefined; end = p.closers.get(at)) at = end
  return { at, isInCode }
}

export type Mark = { index: number; text: string }

const BLOCK_START = /^ {0,3}(#|>|[-*+] |\d+[.)] |`{3}|~{3}|\|)/

/**
 * Draws `⁽ⁿ⁾` after each Excerpt's first occurrence; an Excerpt that cannot
 * be found is marked `ⁿ` (①②…) at the head of the row instead.
 */
export function drawMarks(md: string, marks: readonly Mark[], kind: RowKind): string {
  if (marks.length === 0) return md
  const placed: { at: number; mark: string }[] = []
  const unplaced: string[] = []
  for (const m of marks) {
    const p = place(md, m.text, kind)
    if (p === undefined) unplaced.push(circled(m.index))
    else placed.push({ at: p.at, mark: p.isInCode ? superscript(m.index) : codeMark(superscript(m.index)) })
  }
  let text = md
  for (const { at, mark } of placed.sort((a, b) => b.at - a.at)) {
    text = text.slice(0, at) + mark + text.slice(at)
  }
  if (unplaced.length > 0) {
    text = codeMark(unplaced.join('')) + (BLOCK_START.test(text) ? '\n\n' : ' ') + text
  }
  return text
}

/** Offsets [start, end) of code spans and fenced code blocks. */
function codeRanges(md: string): [number, number][] {
  const ranges: [number, number][] = []
  const fenced = /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\1[^\n]*$|(?![\s\S]))/gm
  for (const f of md.matchAll(fenced)) ranges.push([f.index, f.index + f[0].length])
  const spans = /(`+)[\s\S]*?\1/g
  for (const s of md.matchAll(spans)) {
    if (!ranges.some(([a, b]) => s.index >= a && s.index < b)) ranges.push([s.index, s.index + s[0].length])
  }
  return ranges
}

const DIRECTIVE = /:annotation\{index="(\d+)"\}/g

/**
 * Replaces each `:annotation{index="N"}` Claude wrote with a coloured ⓝ; one
 * inside code is Claude showing the syntax, and stays as written.
 */
export function drawCitations(md: string): string {
  if (!md.includes(':annotation{')) return md
  const code = codeRanges(md)
  return md.replace(DIRECTIVE, (whole: string, n: string, at: number) =>
    code.some(([a, b]) => at >= a && at < b) ? whole : codeMark(circled(Number(n))),
  )
}
