// Fitting text into terminal cells.

/**
 * Cells a character takes in the terminal: two for East Asian wide ones and
 * for emoji drawn as emoji by default (🚀 📎), one for the rest — symbols
 * such as ⏺ ✚ ✕ ⎿ ① stay one cell wide.
 */
export function cells(c: string): number {
  return /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]|\p{Emoji_Presentation}/u.test(c) ? 2 : 1
}

/** The text on one line, cut with … to fit `room` cells. */
export function preview(text: string, room: number): string {
  const chars = [...text.replace(/\s+/g, ' ').trim()]
  const width = chars.reduce((n, c) => n + cells(c), 0)
  if (width <= room) return chars.join('')
  let used = 1
  let cut = 0
  while (cut < chars.length && used + cells(chars[cut]!) <= Math.max(2, room)) used += cells(chars[cut++]!)
  return `${chars.slice(0, cut).join('')}…`
}
