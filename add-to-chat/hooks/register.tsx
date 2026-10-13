// The engine glue: every call on `$` lives here (the engine follows `$`
// only within this file); the decisions are the pure modules beside it.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { AnnotationSource, Original } from '../types'
import { appended, commentingAfterRemoving, withComment, without } from './annotations'
import { bandView } from './band'
import { circled } from './excerpt'
import { hashText } from './hash'
import { SEND_PLACEHOLDER } from './labels'
import { promptText, replyText } from './rows'
import { judge, selectionKey } from './selection'
import type { Surroundings, Verdict } from './selection'
import { annotated, withOriginal } from './send'
import { DEFAULT_TEMPLATE } from './template'
import type { Annotation } from '../types'

const pending = atom({ plugin: 'add-to-chat', key: 'pending' } as const, [])
const candidate = atom({ plugin: 'add-to-chat', key: 'candidate' } as const, null)
const handled = atom({ plugin: 'add-to-chat', key: 'handled' } as const, null)
const commenting = atom({ plugin: 'add-to-chat', key: 'commenting' } as const, null)
const isListOpen = atom({ plugin: 'add-to-chat', key: 'isListOpen' } as const, false)
const isDraftEmpty = atom({ plugin: 'add-to-chat', key: 'isDraftEmpty' } as const, true)
const originals = atom({ plugin: 'add-to-chat', key: 'originals' } as const, {})

const POLL_MS = 250
const STORE_ORIGINALS = 'originals'
const MAX_ORIGINALS = 200

/**
 * Which rows are replies and which are the person's prompts, by requestId.
 * Render hooks fill it and may not write state; it is a cache, not drawing
 * state: after a reload every row in view draws again and refills it, and a
 * selection in a row out of view carries no requestId anyway.
 */
const roles = new Map<string, AnnotationSource>()

function rememberRole(requestId: string | undefined, role: AnnotationSource) {
  if (requestId !== undefined && requestId !== 'placeholder') roles.set(requestId, role)
}

async function surroundings($: EngineInterface): Promise<Surroundings> {
  return {
    draft: (await $.prompt.read()).text,
    offer: await read($, candidate),
    pending: await read($, pending),
    handled: await read($, handled),
  }
}

/** The draft as it stood when a Comment field opened, by that Annotation's index. */
type DraftWatch = { index?: number; text?: string }

/** One tick of the selection poll: what the band offers, and the draft's state. */
async function poll($: EngineInterface, draft: DraftWatch) {
  const [selection, around] = await Promise.all([$.ui.selection(), surroundings($)])

  const isEmpty = around.draft.trim() === ''
  if ((await read($, isDraftEmpty)) !== isEmpty) await update($, isDraftEmpty, () => isEmpty)
  // Typing in the prompt after the Comment field opened means the person
  // left it (Esc); Esc itself raises nothing.
  const editing = await read($, commenting)
  if (editing === null || editing !== draft.index) {
    draft.index = editing ?? undefined
    draft.text = around.draft
  } else if (around.draft !== draft.text) {
    await update($, commenting, () => null)
  }

  // The band previews the Excerpt as it will be kept, marks and 📎 gone.
  const verdict = judge(selection, around)
  const offer = 'excerpt' in verdict ? verdict.excerpt : null
  if (offer?.text !== around.offer?.text || offer?.requestId !== around.offer?.requestId) {
    // State holds JSON: a row-less selection has no requestId key at all.
    await update($, candidate, () => (offer === null ? null : offer.requestId === undefined ? { text: offer.text } : { text: offer.text, requestId: offer.requestId }))
  }
}

async function addSelection($: EngineInterface): Promise<{ annotation: Annotation } | Exclude<Verdict, { excerpt: unknown }>> {
  const selection = await $.ui.selection()
  const verdict = judge(selection, await surroundings($))
  if (!('excerpt' in verdict) || selection === undefined) return 'excerpt' in verdict ? { reason: 'nothing' } : verdict

  const { excerpt } = verdict
  const source = (excerpt.requestId !== undefined && roles.get(excerpt.requestId)) || 'transcript'
  const list = await update($, pending, now => appended(now, excerpt, source))
  const annotation = list.at(-1)!
  await update($, handled, () => selectionKey(selection))
  await update($, candidate, () => null)
  await update($, commenting, () => annotation.index)
  return { annotation }
}

async function ignoreSelection($: EngineInterface) {
  const selection = await $.ui.selection()
  if (selection !== undefined) await update($, handled, () => selectionKey(selection))
  await update($, candidate, () => null)
}

async function removeAnnotation($: EngineInterface, index: number) {
  const list = await update($, pending, now => without(now, index))
  await update($, commenting, at => commentingAfterRemoving(at, index))
  if (list.length === 0) await update($, isListOpen, () => false)
}

async function clearPending($: EngineInterface) {
  await update($, pending, () => [])
  await update($, commenting, () => null)
  await update($, isListOpen, () => false)
}

async function loadTemplate($: EngineInterface, options: PluginOptions): Promise<string> {
  const path = typeof options.templatePath === 'string' ? options.templatePath.trim() : ''
  if (path === '') return DEFAULT_TEMPLATE
  const full = path.startsWith('~/') ? `${(await $.env.get('HOME')) ?? '~'}${path.slice(1)}` : path
  try {
    return await $.fs.read(full)
  } catch {
    $.ui.toast(`add-to-chat: cannot read ${path}; using the built-in template`)
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
    // A reload keeps state but not the band's drawing: clearing the offer
    // makes the first poll write it again, so the new code draws it.
    await update($, candidate, () => null)
    // A reload drops the previous load's timers and fires session.start
    // again, so this is the only interval running.
    const draft: DraftWatch = {}
    $.clock.every(POLL_MS, () => poll($, draft))
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

  on('command.run', { command: 'add-to-chat' }, async ($, e) => {
    const added = await addSelection($)
    if ('annotation' in added) {
      $.ui.toast(`Added ${circled(added.annotation.index)} — add an optional comment above the prompt`)
    } else if (added.reason === 'already') {
      $.ui.toast('That selection is already added')
    } else if (e.presentation.isFullscreen) {
      $.ui.toast('Select text in the transcript first')
    } else {
      $.ui.toast('add-to-chat needs fullscreen mode (CLAUDE_CODE_NO_FLICKER=1) to read the selection')
    }
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
    rememberRole(e.requestId, 'claude')
    const text = replyText(e.props.text, e.requestId, await read($, pending))
    return text === e.props.text ? next(e) : next({ ...e, props: { ...e.props, text } })
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (e.props.origin.kind !== 'composer') return next(e)
    rememberRole(e.requestId, 'you')
    const original = e.props.isExpanded ? undefined : (await read($, originals))[hashText(e.props.text)]
    const text = promptText(e.props.text, e.requestId, await read($, pending), original)
    return text === e.props.text ? next(e) : next({ ...e, props: { ...e.props, text } })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || e.surface === 'mobile') return next(e)
    const tree = bandView(
      $.ui.resolve(e),
      {
        offer: await read($, candidate),
        pending: await read($, pending),
        commenting: await read($, commenting),
        isListOpen: await read($, isListOpen),
        isDraftEmpty: await read($, isDraftEmpty),
        isFullscreen: e.viewport?.isFullscreen === true,
        columns: e.props.bodyColumns,
        maxRows: e.props.maxRows,
      },
      {
        add: async () => {
          const added = await addSelection($)
          // A click leaves the keyboard with the prompt, so this only
          // moves the ring when the band was focused (ctrl+x tab).
          if ('annotation' in added) {
            await $.ui.focus({ requestId: e.requestId, key: `comment-${added.annotation.index}` }).catch(() => undefined)
          }
        },
        ignore: () => ignoreSelection($),
        comment: async (index, value) => {
          await update($, pending, now => withComment(now, index, value))
          await update($, commenting, () => null)
        },
        remove: index => removeAnnotation($, index),
        toggleList: () => update($, isListOpen, open => !open),
        send: () => $.prompt.fill({ text: SEND_PLACEHOLDER }),
      },
    )
    return tree ?? next(e)
  })
}
