// Finding text on a terminal screen by cell, as the mouse addresses it.
import { BAND_BAR } from '../../add-to-chat/hooks/labels.ts'
import { width } from '../../add-to-chat/hooks/text.ts'

/** A 1-based cell position and the cells the text spans from it. */
export type Spot = { x: number; y: number; width: number }

/** The `nth` occurrence of `needle` on `screen`, top to bottom, left to right. */
export function locate(screen: string, needle: string, nth = 1, inRow: (row: string) => boolean = () => true): Spot | undefined {
  let seen = 0
  const rows = screen.split('\n')
  for (let y = 0; y < rows.length; y += 1) {
    const row = rows[y]!
    if (!inRow(row)) continue
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

/** Whether a row is the band's: led by its accent bar at the left edge. */
export function isBandRow(row: string): boolean {
  return row.startsWith(`${BAND_BAR} `)
}

/** The band's rows. */
export function bandRows(screen: string): string[] {
  return screen.split('\n').filter(isBandRow)
}

/** Whether a row is one of the horizontal rules around the prompt box. */
export function isRule(row: string): boolean {
  return /^─{20,}/.test(row)
}
