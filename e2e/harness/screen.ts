// Finding text on a terminal screen by cell, as the mouse addresses it.
import { cells } from '../../add-to-chat/hooks/text.ts'

/** A 1-based cell position and the cells the text spans from it. */
export type Spot = { x: number; y: number; width: number }

function width(text: string): number {
  return [...text].reduce((n, c) => n + cells(c), 0)
}

/** The `nth` occurrence of `needle` on `screen`, top to bottom, left to right. */
export function locate(screen: string, needle: string, nth = 1): Spot | undefined {
  let seen = 0
  const rows = screen.split('\n')
  for (let y = 0; y < rows.length; y += 1) {
    const row = rows[y]!
    for (let from = 0; ; ) {
      const at = row.indexOf(needle, from)
      if (at === -1) break
      seen += 1
      if (seen === nth) return { x: width(row.slice(0, at)) + 1, y: y + 1, width: width(needle) }
      from = at + needle.length
    }
  }
  return undefined
}

/** How many times `needle` shows on `screen`. */
export function count(screen: string, needle: string): number {
  return screen.split('\n').reduce((n, row) => n + row.split(needle).length - 1, 0)
}

/** The band's rows: the ones the mod draws, led by its accent bar at the left edge. */
export function bandRows(screen: string): string[] {
  return screen.split('\n').filter(row => row.startsWith('▎ '))
}
