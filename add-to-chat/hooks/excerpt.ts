// Finding an Excerpt (rendered text, as a mouse copy takes it) inside a row's
// markdown, and drawing numbered marks and Citations into it. Why matching
// goes through a projection: docs/design.md, "Marks in the transcript".

import { circled, superscript } from './labels'

/** How a row's markdown is drawn: replies render links, prompts keep them raw. */
export type RowKind = 'assistant' | 'user'

/** Marks this mod draws; they come along when the person selects over them. */
// U+200B keeps a mark's backticks from fusing with a neighbouring span's.
const MARK_CHAR = /[⁽⁾⁰¹²³⁴⁵⁶⁷⁸⁹①-⑳㉑-㉟㊱-㊿\u200b]/
const MARK_CHARS = new RegExp(MARK_CHAR.source, 'g')
export function stripMarks(text: string): string {
  return text.replace(MARK_CHARS, '')
}

/**
 * A mark drawn in the terminal's inline-code colour, inserted at `at`; a
 * backtick right beside it would fuse into one longer, broken delimiter.
 */
function codeMark(mark: string, md = '', at = 0): string {
  const before = md[at - 1] === '`' ? '\u200b' : ''
  const after = md[at] === '`' ? '\u200b' : ''
  return `${before}\`${mark}\`${after}`
}

type Projection = {
  /** The text as drawn. */
  plain: string
  /** Markdown offset of each plain character. */
  map: number[]
  /** Whether each plain character lies in a fenced code block. */
  inFence: boolean[]
  /** Whether each plain character lies in a code span. */
  inSpan: boolean[]
  /** Markdown offsets where a closing delimiter starts, mapped to where it ends. */
  closers: Map<number, number>
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/

/**
 * Where the code span opened by the `n` backticks at `i` closes, as
 * CommonMark has it: the next run of exactly `n` backticks before the
 * paragraph ends. -1 when none does: the run is then literal text.
 */
function spanClose(md: string, i: number, n: number): number {
  const paragraphEnd = md.indexOf('\n\n', i)
  const limit = paragraphEnd === -1 ? md.length : paragraphEnd
  let j = i + n
  while (j < limit) {
    if (md[j] !== '`') {
      j += 1
      continue
    }
    let k = j
    while (md[k] === '`') k += 1
    if (k - j === n) return j
    j = k
  }
  return -1
}

/**
 * Projects markdown onto the text the terminal draws for it, keeping each
 * drawn character's offset in the markdown.
 */
function project(md: string, kind: RowKind): Projection {
  const out: Projection = { plain: '', map: [], inFence: [], inSpan: [], closers: new Map() }
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
      const nl = md.indexOf('\n', i)
      const lineEnd = nl === -1 ? md.length : nl
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
    if (c === '\\' && kind === 'assistant' && /[\\`*_[\]()#>!-]/.test(md[i + 1] ?? '')) {
      emit(md[i + 1]!, i + 1)
      i += 2
      continue
    }
    if (c === '`') {
      const run = /^`+/.exec(md.slice(i))![0]
      const close = spanClose(md, i, run.length)
      if (close === -1) {
        for (let j = 0; j < run.length; j += 1) emit('`', i + j)
        i += run.length
        continue
      }
      for (let j = i + run.length; j < close; j += 1) {
        if (!MARK_CHAR.test(md[j]!)) emit(md[j]!, j, false, true)
      }
      out.closers.set(close, close + run.length)
      i = close + run.length
      continue
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
    // `~~strike~~` is drawn with its tildes, so they stay.
    const isIntraword = c === '_' && /[\p{L}\p{N}]/u.test(md[i - 1] ?? '') && /[\p{L}\p{N}]/u.test(md[i + 1] ?? '')
    if (c === '*' || (c === '_' && kind === 'assistant' && !isIntraword)) {
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
 * the projected markdown: past any delimiter the match closes, so the mark
 * never lands inside a link; `isInCode` when the match ends in a code span,
 * where the mark goes inside it, bare, and takes the span's colour.
 * Undefined when it is not found or ends in a code block.
 */
function place(p: Projection, excerpt: string): Placement | undefined {
  const words = stripMarks(excerpt).split(/\s+/).filter(Boolean)
  if (words.length === 0) return undefined
  const found = new RegExp(words.map(escapeRegExp).join('\\s+')).exec(p.plain)
  if (found === null) return undefined
  const last = found.index + found[0].length - 1
  if (p.inFence[last]) return undefined
  let at = p.map[last]! + 1
  const isInCode = p.inSpan[last]!
  if (!isInCode) for (let end = p.closers.get(at); end !== undefined; end = p.closers.get(at)) at = end
  return { at, isInCode }
}

/** The markdown offset a mark for `excerpt` goes at; for tests. */
export function markOffset(md: string, excerpt: string, kind: RowKind): number | undefined {
  return place(project(md, kind), excerpt)?.at
}

export type Mark = { index: number; text: string }

const BLOCK_START = /^ {0,3}(#|>|[-*+] |\d+[.)] |`{3}|~{3}|\|)/

/**
 * Draws `⁽ⁿ⁾` after each Excerpt's first occurrence; an Excerpt that cannot
 * be found is marked `ⁿ` (①②…) at the head of the row instead.
 */
export function drawMarks(md: string, marks: readonly Mark[], kind: RowKind): string {
  if (marks.length === 0) return md
  const projection = project(md, kind)
  const placed: { at: number; mark: string }[] = []
  const unplaced: string[] = []
  for (const m of marks) {
    const p = place(projection, m.text)
    if (p === undefined) unplaced.push(circled(m.index))
    else placed.push({ at: p.at, mark: p.isInCode ? superscript(m.index) : codeMark(superscript(m.index), md, p.at) })
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

const DIRECTIVE = /:annotation\{index="(\d+)"\}/g

/**
 * Replaces each `:annotation{index="N"}` Claude wrote with a coloured ⓝ; one
 * inside code is Claude showing the syntax, and stays as written.
 */
export function drawCitations(md: string): string {
  if (!md.includes(':annotation{')) return md
  const p = project(md, 'assistant')
  const inCode = new Set(p.map.filter((_, k) => p.inFence[k] || p.inSpan[k]))
  return md.replace(DIRECTIVE, (whole: string, n: string, at: number) => (inCode.has(at) ? whole : codeMark(circled(Number(n)), md, at)))
}
