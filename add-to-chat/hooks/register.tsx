// The engine glue: every call on `$` lives here (the engine follows `$`
// only within this file); the decisions are the pure modules beside it.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register, UiPane } from 'claude-code'

import type { Annotation, AnnotationSource, Candidate, Original } from '../types'
import { appended, withComment, without } from './annotations'
import { hashText } from './hash'
import { ALREADY_ADDED, NEEDS_FULLSCREEN, PANE_TITLE, SEND_PLACEHOLDER, addedToast, clipLine, unreadableTemplate } from './labels'
import { PANE_COLUMNS, PANE_ID, paneView, tabAfterRemoving } from './pane'
import { promptText, replyText } from './rows'
import { SYSTEM_ROWS, TOOL_ROWS, judge, rowSource, selectionKey } from './selection'
import type { Surroundings, Verdict } from './selection'
import { annotated, withOriginal } from './send'
import { DEFAULT_TEMPLATE } from './template'

const pending = atom({ plugin: 'add-to-chat', key: 'pending' } as const, [])
const candidate = atom({ plugin: 'add-to-chat', key: 'candidate' } as const, null)
const handled = atom({ plugin: 'add-to-chat', key: 'handled' } as const, null)
const isPaneOpen = atom({ plugin: 'add-to-chat', key: 'isPaneOpen' } as const, false)
const isPaneDismissed = atom({ plugin: 'add-to-chat', key: 'isPaneDismissed' } as const, false)
const paneTab = atom({ plugin: 'add-to-chat', key: 'paneTab' } as const, 1)
const isDraftEmpty = atom({ plugin: 'add-to-chat', key: 'isDraftEmpty' } as const, true)
const originals = atom({ plugin: 'add-to-chat', key: 'originals' } as const, {})

const POLL_MS = 250
const STORE_ORIGINALS = 'originals'
const MAX_ORIGINALS = 200

/**
 * Each transcript row's Source, by requestId.
 * Render hooks fill it and may not write state; it is a cache, not drawing
 * state: after a reload every row in view draws again and refills it, and a
 * selection in a row out of view carries no requestId anyway.
 */
const roles = new Map<string, AnnotationSource>()

function rememberRole(requestId: string | undefined, component: string, props: unknown) {
  if (requestId !== undefined && requestId !== 'placeholder') roles.set(requestId, rowSource(component, props))
}

async function surroundings($: EngineInterface): Promise<Surroundings> {
  const [prompt, list, key] = await Promise.all([$.prompt.read(), read($, pending), read($, handled)])
  return { draft: prompt.text, pending: list, handled: key }
}

/** What the poll last wrote, so it writes state only on a change. */
type PollWatch = { isDraftEmpty?: boolean; isPaneOpen?: boolean; isPaneDrawn?: boolean }

function offerKey(offer: Candidate | null): string | null {
  return offer === null ? null : selectionKey(offer)
}

/** One tick of the selection poll: what the pane offers, the draft's state, whether the pane is open. */
async function poll($: EngineInterface, watch: PollWatch) {
  const [selection, around, offered, panes] = await Promise.all([$.ui.selection(), surroundings($), read($, candidate), $.ui.panes()])

  const isEmpty = around.draft.trim() === ''
  if (watch.isDraftEmpty !== isEmpty) {
    watch.isDraftEmpty = isEmpty
    await update($, isDraftEmpty, () => isEmpty)
  }
  const isOpen = panes.some(p => p.id === PANE_ID)
  if (watch.isPaneOpen !== isOpen) {
    watch.isPaneOpen = isOpen
    await update($, isPaneOpen, () => isOpen)
  }
  const isDrawn = isPaneDrawn(panes)
  if (watch.isPaneDrawn !== isDrawn) {
    watch.isPaneDrawn = isDrawn
    showCount($, around.pending, isDrawn)
  }

  // The pane previews the Excerpt as it will be kept, marks and 📎 gone.
  const verdict = judge(selection, around)
  const offer = 'excerpt' in verdict ? verdict.excerpt : null
  if (offerKey(offer) !== offerKey(offered)) await update($, candidate, () => offer)
}

/** Done with a selection: it is not offered again until another is made. */
async function markHandled($: EngineInterface, key: string | undefined) {
  await Promise.all([key === undefined ? null : update($, handled, () => key), update($, candidate, () => null)])
}

async function addSelection($: EngineInterface): Promise<{ annotation: Annotation } | Exclude<Verdict, { excerpt: unknown }>> {
  const verdict = judge(await $.ui.selection(), await surroundings($))
  if (!('excerpt' in verdict)) return verdict

  const { excerpt } = verdict
  const source = (excerpt.requestId !== undefined && roles.get(excerpt.requestId)) || 'transcript'
  const list = await update($, pending, now => appended(now, excerpt, source))
  const annotation = list.at(-1)!
  await Promise.all([markHandled($, verdict.key), update($, paneTab, () => annotation.index)])
  showCount($, list, isPaneDrawn(await $.ui.panes()))
  return { annotation }
}

async function ignoreSelection($: EngineInterface) {
  const selection = await $.ui.selection()
  await markHandled($, selection === undefined ? undefined : selectionKey(selection))
}

/** Whether the pane is drawn now: open, and placed by the surface. */
function isPaneDrawn(panes: readonly UiPane[]): boolean {
  return panes.some(p => p.id === PANE_ID && p.isPlaced)
}

/** The pending count in the status line, while the pane, which shows it as tabs, is not drawn. */
function showCount($: EngineInterface, list: readonly Annotation[], isDrawn: boolean) {
  $.ui.status(list.length === 0 || isDrawn ? undefined : clipLine(list.length))
}

async function removeAnnotation($: EngineInterface, index: number) {
  const [list, , panes] = await Promise.all([update($, pending, now => without(now, index)), update($, paneTab, at => tabAfterRemoving(at, index)), $.ui.panes()])
  showCount($, list, isPaneDrawn(panes))
}

async function clearPending($: EngineInterface) {
  await update($, pending, () => [])
  showCount($, [], false)
}

/** Opens the pane at the person's asking: placed at any width, and no longer dismissed. */
async function openPane($: EngineInterface) {
  await $.ui.open({ id: PANE_ID, title: PANE_TITLE, columns: PANE_COLUMNS })
  await Promise.all([update($, isPaneOpen, () => true), update($, isPaneDismissed, () => false)])
}

async function loadTemplate($: EngineInterface, options: PluginOptions): Promise<string> {
  const path = typeof options.templatePath === 'string' ? options.templatePath.trim() : ''
  if (path === '') return DEFAULT_TEMPLATE
  const full = path.startsWith('~/') ? `${(await $.env.get('HOME')) ?? '~'}${path.slice(1)}` : path
  try {
    return await $.fs.read(full)
  } catch {
    $.ui.toast(unreadableTemplate(path))
    return DEFAULT_TEMPLATE
  }
}

async function rememberOriginal($: EngineInterface, rewritten: string, original: Original) {
  const map = await update($, originals, now => withOriginal(now, hashText(rewritten), original, MAX_ORIGINALS))
  await $.store.set(STORE_ORIGINALS, map)
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'add-to-chat',
      description: 'Add the text selected in the transcript to your next prompt',
    })
    const stored = await $.store.get(STORE_ORIGINALS)
    if (stored !== undefined && typeof stored === 'object' && stored !== null) {
      await update($, originals, () => stored as Record<string, Original>)
    }
    // A reload keeps state but not the pane's drawing: clearing the offer
    // makes the first poll write it again, so the new code draws it.
    await update($, candidate, () => null)
    // A reload drops the previous load's timers and fires session.start
    // again, so this is the only interval running.
    // Empty, so its first tick sets the status line too.
    const watch: PollWatch = {}
    $.clock.every(POLL_MS, () => poll($, watch))
    return next(e)
  })

  // /clear ends the session without a new session.start: the rows the
  // pending Annotations point at are gone.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await clearPending($)
      await update($, candidate, () => null)
    }
    return next(e)
  })

  // Opens the pane (again), and adds the selection if there is one to add.
  on('command.run', { command: 'add-to-chat' }, async ($, e) => {
    if (!e.presentation.isFullscreen) {
      $.ui.toast(NEEDS_FULLSCREEN)
      return {}
    }
    await openPane($)
    const added = await addSelection($)
    if ('annotation' in added) $.ui.toast(addedToast(added.annotation.index))
    else if (added.reason === 'already') $.ui.toast(ALREADY_ADDED)
    return {}
  })

  on('prompt.submit', async ($, e, next) => {
    const list = await read($, pending)
    if (e.origin.kind !== 'composer' || list.length === 0) return next(e)
    const sent = annotated(await loadTemplate($, options), e.text, e.context, list)
    if (sent.original !== undefined) await rememberOriginal($, sent.text, sent.original)
    const entered = await next({ ...e, text: sent.text, context: sent.context })
    if (!('drop' in entered)) await clearPending($)
    return entered
  }).catch(($, e, next) => next(e))

  // A long reply's row can stay as it was drawn mid-stream, before its
  // Citations were complete; drawing the rows again once the turn ends
  // shows them.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    $.ui.invalidate('ui.render')
    return done
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    rememberRole(e.requestId, e.component, e.props)
    const text = replyText(e.props.text, e.requestId, await read($, pending))
    return text === e.props.text ? next(e) : next({ ...e, props: { ...e.props, text } })
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    rememberRole(e.requestId, e.component, e.props)
    if (e.props.origin.kind !== 'composer') return next(e)
    const [list, map] = await Promise.all([read($, pending), read($, originals)])
    const original = e.props.isExpanded ? undefined : map[hashText(e.props.text)]
    const text = promptText(e.props.text, e.requestId, list, original)
    return text === e.props.text ? next(e) : next({ ...e, props: { ...e.props, text } })
  })

  // The rows nothing here draws on are seen only for their Source.
  on('ui.render', { component: [...TOOL_ROWS, ...SYSTEM_ROWS] }, async ($, e, next) => {
    rememberRole(e.requestId, e.component, e.props)
    return next(e)
  })

  // The person closing the pane (its ✕, ctrl+x x) keeps it closed until
  // they ask for it again with /add-to-chat.
  on('ui.close', { id: PANE_ID }, async ($, e, next) => {
    await update($, isPaneOpen, () => false)
    if (e.origin.kind === 'person') await update($, isPaneDismissed, () => true)
    return next(e)
  })

  // Claude Code keeps its band; add-to-chat draws in its pane, which the
  // band's first fullscreen drawing opens unless the person closed it. Open
  // from the start, it never narrows the transcript under a mouse mid-drag.
  // (Opened unasked, a terminal under 144 columns waits for /add-to-chat.)
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.viewport?.isFullscreen === true) {
      const [isOpen, isDismissed] = await Promise.all([read($, isPaneOpen), read($, isPaneDismissed)])
      if (!isOpen && !isDismissed) void $.ui.open({ id: PANE_ID, title: PANE_TITLE, columns: PANE_COLUMNS })
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e, next) => {
    // Mobile has no text field to edit a Comment in.
    if (e.surface === 'mobile') return next(e)
    const [offer, list, tab, isEmpty] = await Promise.all([read($, candidate), read($, pending), read($, paneTab), read($, isDraftEmpty)])
    return paneView(
      $.ui.resolve(e),
      { offer, pending: list, tab, isDraftEmpty: isEmpty, isFullscreen: e.viewport?.isFullscreen === true, columns: e.props.bodyColumns },
      {
        add: async () => {
          const added = await addSelection($)
          // A click leaves the keyboard with the prompt, so this only
          // moves the ring when the pane was focused.
          if ('annotation' in added) {
            await $.ui.focus({ requestId: PANE_ID, key: `comment-${added.annotation.index}` }).catch(() => undefined)
          }
        },
        ignore: () => ignoreSelection($),
        show: index => update($, paneTab, () => index),
        remove: index => removeAnnotation($, index),
        comment: (index, value) => update($, pending, now => withComment(now, index, value)),
        send: () => $.prompt.fill({ text: SEND_PLACEHOLDER }),
      },
    )
  })
}
