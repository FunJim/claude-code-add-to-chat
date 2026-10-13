// The mouse, as SGR (1006) sequences written into the terminal.
import { sleep } from './exec.ts'
import type { Terminal } from './terminal.ts'

export type Point = { x: number; y: number }

/**
 * Two presses closer than this count as a double (or triple) click, which
 * selects a word or a whole line instead of what was dragged over.
 */
const MULTI_CLICK_MS = 1_300

export class Mouse {
  private readonly term: Terminal
  private lastPress = 0

  constructor(term: Terminal) {
    this.term = term
  }

  /** Presses the left button at `at` (no release). */
  async press(at: Point) {
    const wait = this.lastPress + MULTI_CLICK_MS - Date.now()
    if (wait > 0) await sleep(wait)
    this.lastPress = Date.now()
    await this.term.write(`\x1b[<0;${at.x};${at.y}M`)
  }

  /** Press at `from`, move to `to`, release there: selects what lies between, both ends included. */
  async drag(from: Point, to: Point) {
    await this.press(from)
    await sleep(80)
    await this.term.write(`\x1b[<32;${to.x};${to.y}M`)
    await sleep(80)
    await this.term.write(`\x1b[<0;${to.x};${to.y}m`)
  }

  async click(at: Point) {
    await this.press(at)
    await sleep(60)
    await this.term.write(`\x1b[<0;${at.x};${at.y}m`)
  }

  /** Mouse-wheel notches over `at`: up scrolls the transcript back. */
  async wheel(direction: 'up' | 'down', notches: number, at: Point = { x: 20, y: 5 }) {
    const button = direction === 'up' ? 64 : 65
    for (let i = 0; i < notches; i += 1) {
      await this.term.write(`\x1b[<${button};${at.x};${at.y}M`)
      await sleep(40)
    }
  }
}
