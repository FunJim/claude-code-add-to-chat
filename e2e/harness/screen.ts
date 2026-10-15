// Finding text on a terminal screen by cell, as the mouse addresses it, and
// telling the transcript from the add-to-chat pane beside or above it.
import { width } from '../../add-to-chat/hooks/text.ts'

/** A 1-based cell position and the cells the text spans from it. */
export type Spot = { x: number; y: number; width: number }

/** A rectangle of cells, 1-based and inclusive. */
export type Area = { top: number; bottom: number; left: number; right: number }

/** The part of `row` drawn in cells `left`..`right`, and the cell it starts at. */
function cellSlice(row: string, left: number, right: number): { text: string; x: number } {
  let x = 1
  let text = ''
  let start = 0
  for (const c of row) {
    const w = width(c)
    if (x >= left && x + w - 1 <= right) {
      if (text === '') start = x
      text += c
    }
    x += w
  }
  return { text, x: text === '' ? left : start }
}

/** The `nth` occurrence of `needle` on `screen` (within `area`), top to bottom, left to right. */
export function locate(screen: string, needle: string, nth = 1, area?: Area): Spot | undefined {
  let seen = 0
  const rows = screen.split('\n')
  for (let y = (area?.top ?? 1) - 1; y < Math.min(rows.length, area?.bottom ?? rows.length); y += 1) {
    const { text: row, x: rowX } = area === undefined ? { text: rows[y]!, x: 1 } : cellSlice(rows[y]!, area.left, area.right)
    for (let from = 0; ; ) {
      const at = row.indexOf(needle, from)
      if (at === -1) break
      seen += 1
      if (seen === nth) return { x: rowX + width(row.slice(0, at)), y: y + 1, width: width(needle) }
      from = at + needle.length
    }
  }
  return undefined
}

/** The rows of `area`, each cut to its cells. */
export function textIn(screen: string, area: Area): string[] {
  return screen
    .split('\n')
    .slice(area.top - 1, area.bottom)
    .map(row => cellSlice(row, area.left, area.right).text)
}

/** Whether a row is one of the horizontal rules around the prompt box. */
export function isRule(row: string): boolean {
  // Browsing the prompt history labels the rule above the box: `─── History 1/3 ───…`.
  return /^─+(?: [^─]+ )?─{20,}/.test(row)
}

/** The 1-based row of the rule above the prompt box (or past the last row). */
function promptTop(rows: readonly string[]): number {
  const i = rows.findIndex(isRule)
  return i === -1 ? rows.length + 1 : i + 1
}

/** An inline pane's frame: the rows of `╭…✕─╮` and its `╰…╯`, 1-based. */
function inlineFrame(rows: readonly string[]): { top: number; bottom: number } | undefined {
  const top = rows.findIndex(r => r.startsWith('╭') && r.includes('✕') && r.trimEnd().endsWith('╮'))
  if (top === -1) return undefined
  const bottom = rows.findIndex((r, i) => i > top && r.startsWith('╰'))
  return bottom === -1 ? undefined : { top: top + 1, bottom: bottom + 1 }
}

/**
 * The cell of a docked pane's border: the column where `│` stands on most
 * rows above the prompt box (a table's bars stand on few).
 */
function dockBorder(rows: readonly string[]): number | undefined {
  const above = rows.slice(0, promptTop(rows) - 1)
  const counts = new Map<number, number>()
  for (const row of above) {
    let x = 1
    for (const c of row) {
      if (c === '│') counts.set(x, (counts.get(x) ?? 0) + 1)
      x += width(c)
    }
  }
  const [column, count] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [0, 0]
  return count >= above.length * 0.6 ? column : undefined
}

/** Where the add-to-chat pane draws: docked beside the transcript, or framed above the prompt. */
export function paneArea(screen: string): Area | undefined {
  const rows = screen.split('\n')
  const columns = Math.max(...rows.map(width))
  const frame = inlineFrame(rows)
  if (frame !== undefined) return { top: frame.top + 1, bottom: frame.bottom - 1, left: 3, right: columns - 2 }
  const border = dockBorder(rows)
  return border === undefined ? undefined : { top: 1, bottom: promptTop(rows) - 1, left: border + 1, right: columns }
}

/** Where the transcript draws: what the pane and the prompt box leave. */
export function transcriptArea(screen: string): Area {
  const rows = screen.split('\n')
  const columns = Math.max(...rows.map(width))
  const frame = inlineFrame(rows)
  if (frame !== undefined) return { top: 1, bottom: frame.top - 1, left: 1, right: columns }
  const border = dockBorder(rows)
  return { top: 1, bottom: promptTop(rows) - 1, left: 1, right: border === undefined ? columns : border - 1 }
}
