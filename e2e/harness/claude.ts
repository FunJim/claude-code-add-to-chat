// One Claude Code session under test, with add-to-chat and the probe
// loaded, driven the way a person would: selecting with the mouse, pressing
// the band's buttons, typing prompts. Every act is confirmed by what the
// probe saw, and retried when the terminal swallowed it.
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { ADD_LABEL, CLOSE_TAB, COMMENT_LABEL, SAVE_LABEL, circled, drawnTab } from '../../add-to-chat/hooks/labels.ts'
import { oneLine } from '../../add-to-chat/hooks/text.ts'
import { retry, sleep, waitFor } from './exec.ts'
import { PLUGIN_DIR, PROBE_DIR } from './fixtures.ts'
import { Mouse } from './mouse.ts'
import { ProbeLog } from './probe.ts'
import type { Annotation, Selection } from './probe.ts'
import { isRule, locate, paneArea, textIn, transcriptArea } from './screen.ts'
import type { Host, Key, Slot, Terminal } from './terminal.ts'
import { Transcript, transcriptPath } from './transcript.ts'

/** How the pane's open tab starts its Excerpt: in a frame, its first line's head after the border. */
export function framed(excerpt: string): string {
  return `│ ${excerpt.split('\n')[0]!.slice(0, 40)}`
}

/** The real model `--model haiku` runs the sessions on: the cheapest that follows the template. */
export const REAL_MODEL = 'haiku'

/** What the sessions talk to: the mock model on its local URL, or the real one. */
export type ModelTarget = { kind: 'mock'; url: string } | { kind: 'real' }

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
  /** Where add-to-chat loads from: a copy a scenario may edit; the repository's own when left out. */
  pluginDir?: string
}

export class NotOnScreen extends Error {}

let launches = 0

export class ClaudeSession {
  readonly name: string
  readonly cwd: string
  readonly term: Terminal
  readonly probe: ProbeLog
  readonly mouse: Mouse
  readonly isFullscreen: boolean

  private constructor(name: string, cwd: string, term: Terminal, probe: ProbeLog, isFullscreen: boolean) {
    this.name = name
    this.cwd = cwd
    this.term = term
    this.probe = probe
    this.mouse = new Mouse(term)
    this.isFullscreen = isFullscreen
  }

  static async launch(host: Host, runDir: string, model: ModelTarget, o: LaunchOptions): Promise<ClaudeSession> {
    launches += 1
    const probeFile = join(runDir, 'probe', `${String(launches).padStart(2, '0')}-${o.name}.jsonl`)
    await mkdir(dirname(probeFile), { recursive: true })
    const fullscreen = o.fullscreen ?? true
    const settings: Record<string, unknown> = {}
    // The person's own settings may turn fullscreen on, or name a gateway
    // and its key; a flag's settings win.
    const env: Record<string, string> = fullscreen ? {} : { CLAUDE_CODE_NO_FLICKER: '0' }
    // An API key, even a made-up one, has Claude Code ask whether to use it;
    // a bearer token goes unasked. Neither reaches anything but the mock.
    if (model.kind === 'mock') Object.assign(env, { ANTHROPIC_BASE_URL: model.url, ANTHROPIC_API_KEY: '', ANTHROPIC_AUTH_TOKEN: 'mock' })
    if (Object.keys(env).length > 0) settings.env = env
    if (o.templatePath !== undefined) {
      const options = { templatePath: o.templatePath }
      settings.pluginConfigs = { 'add-to-chat': { options }, 'add-to-chat@inline': { options } }
    }
    const argv = [
      'claude',
      '--model',
      REAL_MODEL,
      '--plugin-dir',
      o.pluginDir ?? PLUGIN_DIR,
      '--plugin-dir',
      PROBE_DIR,
      ...(o.resume === undefined ? [] : ['--resume', o.resume]),
      ...(Object.keys(settings).length === 0 ? [] : ['--settings', JSON.stringify(settings)]),
    ]
    const term = await host.spawn({ name: o.name, cwd: o.cwd, argv, env: { CLAUDE_CODE_NO_FLICKER: fullscreen ? '1' : '0', ATC_PROBE_LOG: probeFile }, slot: o.slot })
    const session = new ClaudeSession(o.name, o.cwd, term, new ProbeLog(probeFile), fullscreen)
    await session.ready()
    return session
  }

  /** Waits for the prompt box, answering the folder-trust question on the way. */
  private async ready() {
    await waitFor(`${this.name} to be ready`, async () => {
      const screen = await this.screen()
      if (screen.includes('trust this folder')) {
        // Enter on the default, "No, exit", ends the session: a Down the
        // dialog was not yet taking is lost, so press Enter only once Yes
        // shows chosen.
        if (/❯ Yes, I trust this folder/.test(screen)) await this.term.press('enter')
        else await this.term.press('down')
        return false
      }
      return screen.includes('❯') && (await this.probe.of('session')).length > 0
    }, { timeoutMs: 60_000, intervalMs: 200 })
    // Startup notices come and go for a moment; a drag over a moving
    // screen selects what moved under it.
    await this.waitStill(1_500, 10_000)
    // The pane opens by itself only from 144 columns (110 once opened by
    // hand); /add-to-chat opens it at any width.
    if (this.isFullscreen) await this.openPane()
  }

  /** Opens the add-to-chat pane if it is not showing, and waits for the transcript to settle beside it. */
  async openPane() {
    if (paneArea(await this.screen()) !== undefined) return
    await this.command('/add-to-chat')
    await waitFor(`the pane on ${this.name}`, async () => paneArea(await this.screen()) !== undefined, { timeoutMs: 5_000 })
    await this.waitStill()
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
      await sleep(150)
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

  /** Where `text` shows in the transcript (not the pane, which may hold the same words). */
  async find(text: string, nth = 1) {
    const screen = await this.screen()
    const spot = locate(screen, text, nth, transcriptArea(screen))
    if (spot === undefined) throw new NotOnScreen(`"${text}" (#${nth}) is not in ${this.name}'s transcript:\n${screen}`)
    return spot
  }

  /** Where `text` shows in the prompt box. */
  async findInPrompt(text: string) {
    const screen = await this.screen()
    const rows = screen.split('\n')
    const rules = rows.flatMap((row, i) => (isRule(row) ? [i + 1] : []))
    const area = rules.length < 2 ? undefined : { top: rules.at(-2)! + 1, bottom: rules.at(-1)! - 1, left: 1, right: 10_000 }
    const spot = area === undefined ? undefined : locate(screen, text, 1, area)
    if (spot === undefined) throw new NotOnScreen(`"${text}" is not in ${this.name}'s prompt box:\n${screen}`)
    return spot
  }

  /** The pane's rows as drawn, or none while it is closed. */
  async pane(): Promise<string[]> {
    const screen = await this.screen()
    const area = paneArea(screen)
    return area === undefined ? [] : textIn(screen, area)
  }

  /** Whether the pane shows `text`, wrapped over rows or not. */
  async paneShows(text: string): Promise<boolean> {
    return oneLine((await this.pane()).join(' ')).includes(oneLine(text))
  }

  /** Where `text` shows in the pane. */
  async findInPane(text: string) {
    const screen = await this.screen()
    const area = paneArea(screen)
    const spot = area === undefined ? undefined : locate(screen, text, 1, area)
    if (spot === undefined) throw new NotOnScreen(`"${text}" is not in ${this.name}'s pane:\n${screen}`)
    return spot
  }

  /** Clicks inside `text` in the pane, `dx` cells from its start. */
  async clickInPane(text: string, { dx = 1 } = {}) {
    const spot = await this.findInPane(text)
    await this.mouse.click({ x: spot.x + dx, y: spot.y })
  }

  /** Whether the pane offers the selection, given a second (four polls) to do so. */
  async offers(): Promise<boolean> {
    await sleep(1_000)
    return this.paneShows(ADD_LABEL)
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

  /**
   * The rows of the transcript that are fully drawn: below the pinned prompt
   * at the top, above the pane (or the prompt box) at the bottom, with a row
   * of margin. A selection on an edge row carries no requestId.
   */
  private transcriptRows(screen: string): { top: number; bottom: number } {
    return { top: 3, bottom: transcriptArea(screen).bottom - 2 }
  }

  /**
   * Brings `text` well inside the transcript's view by scrolling it. Text
   * off screen is searched for upwards, then downwards once the top is reached.
   */
  async scrollTo(text: string, { nth = 1 } = {}) {
    let search: 'up' | 'down' = 'up'
    let screen = await this.screen()
    for (let step = 0; step < 80; step += 1) {
      const spot = locate(screen, text, nth, transcriptArea(screen))
      const { top, bottom } = this.transcriptRows(screen)
      const where = spot === undefined ? 'away' : spot.y < top ? 'high' : spot.y > bottom ? 'low' : 'in'
      if (where === 'in') return
      await this.mouse.wheel(where === 'high' ? 'up' : where === 'low' ? 'down' : search, where === 'away' ? 4 : 1)
      await sleep(250)
      const after = await this.screen()
      if (after === screen) {
        // The last rows cannot rise any further: as far as it goes will do.
        if (where === 'low') return
        if (where === 'away' && search === 'down') break
        if (where === 'away') search = 'down'
      }
      screen = after
    }
    throw new NotOnScreen(`could not scroll "${text}" into ${this.name}'s view:\n${await this.screen()}`)
  }

  /**
   * Scrolls to `text`, drags over it and returns what Claude Code reads as
   * selected, re-dragging until that is exactly `text` (in a row, with
   * `expectRow`) and holds.
   */
  async select(text: string, { nth = 1, expectRow = false } = {}): Promise<Selection> {
    await this.scrollTo(text, { nth })
    const row = (await this.screen()).split('\n')[(await this.find(text, nth)).y - 1] ?? ''
    // A drag ending on a line's last character can take the line end too.
    if (row.trimEnd().endsWith(text)) throw new Error(`"${text}" ends its line on ${this.name}'s screen; select a piece from inside the line`)
    const isText = (s: Selection | null): s is Selection => s !== null && oneLine(s.text) === oneLine(text) && (!expectRow || s.requestId !== undefined)
    return retry(
      `selecting "${text}" on ${this.name}`,
      async attempt => {
        if (attempt > 1) {
          await this.press('escape')
          await sleep(1_500)
        }
        await this.waitStill()
        const at = await this.find(text, nth)
        await this.mouse.drag({ x: at.x, y: at.y }, { x: at.x + at.width - 1, y: at.y })
      },
      async () => {
        const selected = await this.probe.selection()
        if (!isText(selected)) return undefined
        // It must hold: a row appearing above the band right after (the
        // copy notice) can move what a selection covers.
        await sleep(600)
        return isText(await this.probe.selection()) ? selected : undefined
      },
    )
  }

  /**
   * Drags over `text` the way a person does: holding still halfway for
   * `holdMs` before going on and letting go. Resolves what reads as selected.
   */
  async slowSelect(text: string, holdMs: number): Promise<Selection | null> {
    const spot = await this.find(text)
    await this.mouse.drag({ x: spot.x, y: spot.y }, { x: spot.x + spot.width - 1, y: spot.y }, { holdMs })
    await sleep(1_500)
    return this.probe.selection()
  }

  /** Presses the pane's Add to chat; resolves the Annotation it made. */
  async addSelected(): Promise<Annotation> {
    const before = (await this.probe.pending()).length
    await waitFor(`the offer in ${this.name}'s pane`, () => this.paneShows(ADD_LABEL), { timeoutMs: 5_000 })
    return retry(
      `Add to chat on ${this.name}`,
      () => this.clickInPane(ADD_LABEL, { dx: 2 }),
      async () => {
        const list = await this.probe.pending()
        return list.length > before ? list.at(-1) : undefined
      },
    )
  }

  /** Selects `text` and adds it. */
  async add(text: string, options: { nth?: number } = {}): Promise<Annotation> {
    await this.select(text, options)
    return this.addSelected()
  }

  /** Types a Comment into Annotation `index`'s field in the pane (clicking it to take the keyboard). */
  async comment(index: number, text: string) {
    await this.typeComment(index, text)
    await this.press('enter')
    await waitFor(`Comment ${index} to be saved`, async () => (await this.probe.pending())[index - 1]?.comment === text, { timeoutMs: 5_000 })
  }

  /** Types a Comment in Annotation `index`'s field, and leaves it unsaved (no Enter). */
  async typeComment(index: number, text: string) {
    await this.showTab(index)
    await retry(`the Comment field to take the keyboard on ${this.name}`, () => this.clickInPane(`${COMMENT_LABEL}: `, { dx: COMMENT_LABEL.length + 3 }), () =>
      this.paneShows(`⏎ ${SAVE_LABEL}`),
    )
    await this.type(text)
    await sleep(200)
  }

  /** Annotation `index`'s tab as the pane draws it, `1: Claude`. */
  private async tabOf(index: number): Promise<string> {
    const annotation = (await this.probe.pending())[index - 1]
    if (annotation === undefined) throw new Error(`no Annotation ${circled(index)} on ${this.name}`)
    return drawnTab(annotation)
  }

  /** Shows Annotation `index`'s tab in the pane. */
  async showTab(index: number) {
    const excerpt = (await this.probe.pending())[index - 1]!.text
    const isShown = () => this.paneShows(framed(excerpt))
    if (await isShown()) return
    const tab = await this.tabOf(index)
    await retry(`tab ${circled(index)} to show on ${this.name}`, () => this.clickInPane(tab, { dx: tab.length - 2 }), isShown)
  }

  /** Removes Annotation `index` by closing its tab in the pane. */
  async remove(index: number) {
    const before = (await this.probe.pending()).length
    const tab = await this.tabOf(index)
    await retry(
      `closing tab ${circled(index)} on ${this.name}`,
      () => this.clickInPane(`${tab} ${CLOSE_TAB}`, { dx: tab.length + 1 }),
      async () => (await this.probe.pending()).length < before,
    )
  }

  /** The draft in the prompt box: the rows between the last two rules, less the `❯`. */
  async draft(): Promise<string> {
    const rows = (await this.screen()).split('\n')
    const rules = rows.flatMap((row, i) => (isRule(row) ? [i] : []))
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
    if (await this.paneShows(`⏎ ${SAVE_LABEL}`)) {
      await this.press('escape')
      await sleep(400)
    }
    if ((await this.draft()) !== '') await this.press('ctrl+u')
  }

  /** Runs a slash command typed into the prompt box. */
  async command(line: string) {
    await this.clearDraft()
    await this.type(line)
    await waitFor(`"${line}" in the prompt box`, async () => (await this.draft()).startsWith(line), { timeoutMs: 3_000 })
    // The command menu settles on what was typed.
    await sleep(300)
    await this.press('enter')
    await waitFor(`"${line}" to run`, async () => !(await this.draft()).startsWith(line), { timeoutMs: 5_000 })
  }

  async toasts(): Promise<string[]> {
    return this.probe.toasts()
  }

  /** Presses Enter on what the prompt box holds; resolves once its turn completed. */
  async send({ timeoutMs = 180_000 } = {}) {
    const before = await this.probe.turnsCompleted()
    await this.press('enter')
    await waitFor(`${this.name}'s turn to complete`, async () => (await this.probe.turnsCompleted()) > before, { timeoutMs, intervalMs: 500 })
    await this.waitStill(400, 2_000)
  }

  /** Types a prompt and sends it; resolves once its turn completed. */
  async submit(text: string, options: { timeoutMs?: number } = {}) {
    await this.clearDraft()
    await this.type(text)
    await sleep(300)
    await this.send(options)
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
