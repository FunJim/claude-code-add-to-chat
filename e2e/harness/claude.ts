// One Claude Code session under test, with add-to-chat and the probe
// loaded, driven the way a person would: selecting with the mouse, pressing
// the band's buttons, typing prompts. Every act is confirmed by what the
// probe saw, and retried when the terminal swallowed it.
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { circled } from '../../add-to-chat/hooks/excerpt.ts'
import { sleep, waitFor } from './exec.ts'
import { PLUGIN_DIR, PROBE_DIR } from './fixtures.ts'
import { Mouse } from './mouse.ts'
import { ProbeLog } from './probe.ts'
import type { Annotation, Selection } from './probe.ts'
import { bandRows, locate } from './screen.ts'
import type { Host, Key, Slot, Terminal } from './terminal.ts'
import { Transcript, transcriptPath } from './transcript.ts'

export type LaunchOptions = {
  /** Shown in Herdr's sidebar and in reports. */
  name: string
  cwd: string
  slot?: Slot
  /** A session id to resume (the fixture's). */
  resume?: string
  /** False runs on the main screen, where no selection can be read. */
  fullscreen?: boolean
  /** add-to-chat's `templatePath` option. */
  templatePath?: string
  model?: string
}

export class NotOnScreen extends Error {}

function flat(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

let launches = 0

export class ClaudeSession {
  readonly name: string
  readonly cwd: string
  readonly term: Terminal
  readonly probe: ProbeLog
  readonly mouse: Mouse

  private constructor(name: string, cwd: string, term: Terminal, probe: ProbeLog) {
    this.name = name
    this.cwd = cwd
    this.term = term
    this.probe = probe
    this.mouse = new Mouse(term)
  }

  static async launch(host: Host, runDir: string, o: LaunchOptions): Promise<ClaudeSession> {
    launches += 1
    const probeFile = join(runDir, 'probe', `${String(launches).padStart(2, '0')}-${o.name}.jsonl`)
    await mkdir(dirname(probeFile), { recursive: true })
    const fullscreen = o.fullscreen ?? true
    const settings: Record<string, unknown> = {}
    // The person's own settings may turn fullscreen on; a flag's settings win.
    if (!fullscreen) settings.env = { CLAUDE_CODE_NO_FLICKER: '0' }
    if (o.templatePath !== undefined) {
      const options = { templatePath: o.templatePath }
      settings.pluginConfigs = { 'add-to-chat': { options }, 'add-to-chat@inline': { options } }
    }
    const argv = [
      'claude',
      '--model',
      o.model ?? 'haiku',
      '--plugin-dir',
      PLUGIN_DIR,
      '--plugin-dir',
      PROBE_DIR,
      ...(o.resume === undefined ? [] : ['--resume', o.resume]),
      ...(Object.keys(settings).length === 0 ? [] : ['--settings', JSON.stringify(settings)]),
    ]
    const env = { CLAUDE_CODE_NO_FLICKER: fullscreen ? '1' : '0', ATC_PROBE_LOG: probeFile }
    const term = await host.spawn({ name: o.name, cwd: o.cwd, argv, env, slot: o.slot })
    const session = new ClaudeSession(o.name, o.cwd, term, new ProbeLog(probeFile))
    await session.ready()
    return session
  }

  /** Waits for the prompt box, answering the folder-trust question on the way. */
  private async ready() {
    await waitFor(`${this.name} to be ready`, async () => {
      const screen = await this.screen()
      if (screen.includes('trust this folder')) {
        await this.term.press('down', 'enter')
        return false
      }
      return screen.includes('❯') && (await this.probe.of('session')).length > 0
    }, { timeoutMs: 60_000, intervalMs: 500 })
    // Startup notices come and go for a moment; a drag over a moving
    // screen selects what moved under it.
    await this.waitStill(1_500, 10_000)
  }

  /**
   * Waits until the screen has not changed for `stillMs` (or `timeoutMs`
   * passed: a working session never holds still, and that is fine).
   */
  async waitStill(stillMs = 600, timeoutMs = 4_000) {
    const deadline = Date.now() + timeoutMs
    let last = await this.screen()
    let since = Date.now()
    while (Date.now() < deadline) {
      await sleep(200)
      const now = await this.screen()
      if (now !== last) {
        last = now
        since = Date.now()
      } else if (Date.now() - since >= stillMs) {
        return
      }
    }
  }

  screen() {
    return this.term.screen()
  }

  async band(): Promise<string[]> {
    return bandRows(await this.screen())
  }

  async find(text: string, nth = 1) {
    const screen = await this.screen()
    const spot = locate(screen, text, nth)
    if (spot === undefined) throw new NotOnScreen(`"${text}" (#${nth}) is not on ${this.name}'s screen:\n${screen}`)
    return spot
  }

  /** Where `text` shows in the band (its rows only: the transcript may hold the same words). */
  async findInBand(text: string) {
    const screen = await this.screen()
    const rows = screen.split('\n')
    for (let y = 0; y < rows.length; y += 1) {
      if (!rows[y]!.startsWith('▎ ')) continue
      const spot = locate(rows[y]!, text)
      if (spot !== undefined) return { ...spot, y: y + 1 }
    }
    throw new NotOnScreen(`"${text}" is not in ${this.name}'s band:\n${screen}`)
  }

  /** Clicks inside `text` in the band, `dx` cells from its start. */
  async clickInBand(text: string, { dx = 1 } = {}) {
    const spot = await this.findInBand(text)
    await this.mouse.click({ x: spot.x + dx, y: spot.y })
    await sleep(400)
  }

  async bandShows(text: string): Promise<boolean> {
    return (await this.band()).some(row => row.includes(text))
  }

  async isShowing(text: string): Promise<boolean> {
    return (await this.screen()).includes(text)
  }

  async waitShowing(text: string, timeoutMs = 10_000) {
    await waitFor(`"${text}" on ${this.name}'s screen`, () => this.isShowing(text), { timeoutMs })
  }

  async press(...keys: Key[]) {
    await this.term.press(...keys)
  }

  /**
   * Types `text`; several lines go in as one bracketed paste with CR line
   * ends, as a terminal pastes (a bare LF is dropped).
   */
  async type(text: string) {
    await this.term.write(text.includes('\n') ? `\x1b[200~${text.replace(/\r?\n/g, '\r')}\x1b[201~` : text)
  }

  /** Clicks inside `text` on screen, `dx` cells from its start. */
  async click(text: string, { nth = 1, dx = 1 } = {}) {
    const spot = await this.find(text, nth)
    await this.mouse.click({ x: spot.x + dx, y: spot.y })
    await sleep(400)
  }

  /**
   * The rows of the transcript that are fully drawn: below the pinned prompt
   * at the top, above the band (or the prompt box) at the bottom, with a row
   * of margin. A selection on an edge row carries no requestId.
   */
  private async transcriptRows(screen: string): Promise<{ top: number; bottom: number }> {
    const rows = screen.split('\n')
    const firstBand = rows.findIndex(r => r.startsWith('▎ '))
    const firstRule = rows.findIndex(r => /^─{20,}/.test(r))
    const end = firstBand !== -1 ? firstBand : firstRule !== -1 ? firstRule : rows.length
    return { top: 3, bottom: end - 3 }
  }

  /** Brings `text` well inside the transcript's view by scrolling it. */
  async scrollTo(text: string, { nth = 1 } = {}) {
    const placed = async () => {
      const screen = await this.screen()
      const spot = locate(screen, text, nth)
      if (spot === undefined) return 'away' as const
      const { top, bottom } = await this.transcriptRows(screen)
      return spot.y < top ? ('high' as const) : spot.y > bottom ? ('low' as const) : ('in' as const)
    }
    for (let step = 0; step < 60; step += 1) {
      const where = await placed()
      if (where === 'in') return
      // Away: search upwards first, then back down.
      const direction = where === 'high' ? 'up' : where === 'low' ? 'down' : step < 25 ? 'up' : 'down'
      const before = await this.screen()
      await this.mouse.wheel(direction, where === 'away' ? 4 : 1)
      await sleep(250)
      // The last rows cannot rise any further: as far as it goes will do.
      if (where === 'low' && (await this.screen()) === before) return
    }
    throw new NotOnScreen(`could not scroll "${text}" into ${this.name}'s view:\n${await this.screen()}`)
  }

  /**
   * Drags over `text` and returns what Claude Code reads as selected,
   * re-dragging until that is exactly `text` (in a row, with `expectRow`).
   */
  async select(text: string, { nth = 1, expectRow = false } = {}): Promise<Selection> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const screen = await this.screen()
      const spot = await this.find(text, nth)
      const row = screen.split('\n')[spot.y - 1] ?? ''
      // A drag ending on a line's last character can take the line end too.
      if (row.trimEnd().endsWith(text)) throw new Error(`"${text}" ends its line on ${this.name}'s screen; select a piece from inside the line`)
      if (attempt > 1) {
        await this.press('escape')
        await sleep(1_500)
      }
      await this.waitStill()
      const at = await this.find(text, nth)
      await this.mouse.drag({ x: at.x, y: at.y }, { x: at.x + at.width - 1, y: at.y })
      // A row's selection carries its requestId; one read mid-reflow may not.
      const isText = (s: Selection | null): s is Selection => s !== null && flat(s.text) === flat(text) && (!expectRow || s.requestId !== undefined)
      const selected = await waitFor('the selection', async () => {
        const s = await this.probe.selection()
        return isText(s) ? s : undefined
      }, { timeoutMs: 2_500 }).catch(() => undefined)
      // It must hold: a row appearing above the band right after (the
      // copy notice) can move what a selection covers.
      await sleep(600)
      if (selected !== undefined && isText(await this.probe.selection())) return selected
    }
    throw new Error(`could not select "${text}" on ${this.name}; the selection reads ${JSON.stringify(await this.probe.selection())}`)
  }

  /**
   * Drags over `text` the way a person does: holding still halfway for
   * `holdMs` before going on and letting go. Resolves what reads as selected.
   */
  async slowSelect(text: string, holdMs: number): Promise<Selection | null> {
    const spot = await this.find(text)
    const end = { x: spot.x + spot.width - 1, y: spot.y }
    await this.mouse.press({ x: spot.x, y: spot.y })
    await this.term.write(`\x1b[<32;${spot.x + Math.floor(spot.width / 2)};${spot.y}M`)
    await sleep(holdMs)
    await this.term.write(`\x1b[<32;${end.x};${end.y}M`)
    await sleep(150)
    await this.term.write(`\x1b[<0;${end.x};${end.y}m`)
    await sleep(1_500)
    return this.probe.selection()
  }

  /** Presses the band's Add to chat; resolves the Annotation it made. */
  async addSelected(): Promise<Annotation> {
    const before = (await this.probe.pending()).length
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await this.waitShowing('✚ Add to chat', 5_000)
      await this.clickInBand('✚ Add to chat', { dx: 2 })
      const added = await waitFor('the Annotation', async () => {
        const list = await this.probe.pending()
        return list.length > before ? list.at(-1) : undefined
      }, { timeoutMs: 3_000 }).catch(() => undefined)
      if (added !== undefined) return added
    }
    throw new Error(`Add to chat made no Annotation on ${this.name}:\n${await this.screen()}`)
  }

  /** Selects `text` and adds it. */
  async add(text: string, options: { nth?: number } = {}): Promise<Annotation> {
    await this.select(text, options)
    return this.addSelected()
  }

  /** Types a Comment into the open Comment field (clicking it to take the keyboard). */
  async comment(index: number, text: string) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const field = (await this.bandShows('Add an optional comment')) ? 'Add an optional comment' : 'Optional comment'
      await this.clickInBand(field, { dx: 3 })
      const focused = await waitFor('the Comment field to take the keyboard', () => this.isShowing('⏎ save'), { timeoutMs: 2_000 }).catch(() => false)
      if (focused) break
      if (attempt === 3) throw new Error(`the Comment field never took the keyboard on ${this.name}`)
    }
    await this.type(text)
    await sleep(200)
    await this.press('enter')
    await waitFor(`Comment ${index} to be saved`, async () => (await this.probe.pending())[index - 1]?.comment === text, { timeoutMs: 5_000 })
  }

  /** Opens the list with the count chip at the right of the head row. */
  async openList() {
    const open = async () => (await this.band()).some(row => /📎 \d+ annotations? ▾/.test(row))
    for (let attempt = 1; attempt <= 3 && !(await open()); attempt += 1) {
      await this.clickInBand('annotation', { dx: 0 })
      await sleep(400)
    }
    await waitFor('the list to open', open, { timeoutMs: 3_000 })
  }

  /** Removes Annotation `index` with its ✕ in the open list. */
  async remove(index: number) {
    await this.openList()
    const before = (await this.probe.pending()).length
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const screen = await this.screen()
      const rows = screen.split('\n')
      const y = rows.findIndex(row => row.startsWith('▎ ') && row.includes(`  ${circled(index)} `)) + 1
      if (y === 0) throw new NotOnScreen(`no list row ${circled(index)} on ${this.name}:\n${screen}`)
      const spot = locate(rows[y - 1]!, '✕', (rows[y - 1]!.match(/✕/g) ?? []).length)!
      await this.mouse.click({ x: spot.x, y })
      const removed = await waitFor('the removal', async () => (await this.probe.pending()).length < before, { timeoutMs: 3_000 }).catch(() => false)
      if (removed) return
    }
    throw new Error(`✕ did not remove ${circled(index)} on ${this.name}`)
  }

  /** The draft in the prompt box: the rows between the last two rules, less the `❯`. */
  async draft(): Promise<string> {
    const rows = (await this.screen()).split('\n')
    const rules = rows.flatMap((row, i) => (/^─{20,}/.test(row) ? [i] : []))
    if (rules.length < 2) return ''
    const box = rows.slice(rules.at(-2)! + 1, rules.at(-1)!)
    return box.map(row => row.replace(/^❯ ?/, '').trim()).join('\n').trim()
  }

  /**
   * Gives the keyboard back to the prompt box (a Comment field the band
   * focused holds it otherwise) and empties the box if it holds anything
   * (a key there can move a selection).
   */
  async clearDraft() {
    if (await this.bandShows('⏎ save')) {
      await this.press('escape')
      await sleep(400)
    }
    if ((await this.draft()) !== '') await this.press('ctrl+u')
  }

  /** Runs a slash command typed into the prompt box. */
  async command(line: string) {
    await this.clearDraft()
    await this.type(line)
    await sleep(700)
    await this.press('enter')
    await sleep(1_000)
  }

  async toasts(): Promise<string[]> {
    return this.probe.toasts()
  }

  /** Types a prompt and sends it; resolves once its turn completed. */
  async submit(text: string, { timeoutMs = 180_000 } = {}) {
    const before = await this.probe.turnsCompleted()
    await this.clearDraft()
    await this.type(text)
    await sleep(300)
    await this.press('enter')
    await waitFor(`${this.name}'s turn to complete`, async () => (await this.probe.turnsCompleted()) > before, { timeoutMs, intervalMs: 500 })
    await sleep(800)
  }

  async waitIdle(timeoutMs = 180_000) {
    await waitFor(`${this.name} to be idle`, async () => !(await this.probe.isWorking()), { timeoutMs, intervalMs: 500 })
  }

  async transcript(): Promise<Transcript> {
    return new Transcript(transcriptPath(this.cwd, (await this.probe.session()).id))
  }

  async close() {
    await this.term.close()
  }
}
