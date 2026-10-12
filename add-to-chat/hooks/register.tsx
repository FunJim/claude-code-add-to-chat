import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { Annotation, AnnotationSource, Original } from '../types'
import { circled, drawCitations, drawMarks, stripMarks } from './excerpt'
import { hashText } from './hash'
import { DEFAULT_TEMPLATE, renderTemplate, usesRequest } from './template'

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
const SEND_PLACEHOLDER = '(see annotations)'
const SOURCE_LABEL: Record<AnnotationSource, string> = { claude: 'Claude', you: 'You', transcript: 'Transcript' }

/**
 * Which rows are replies and which are the person's prompts, by requestId.
 * Render hooks fill it and may not write state; it is a cache, not drawing
 * state: after a reload every row in view draws again and refills it, and a
 * selection in a row out of view carries no requestId anyway.
 */
const roles = new Map<string, AnnotationSource>()

type Selection = { text: string; requestId?: string }

function selectionKey(s: Selection): string {
  return `${s.requestId ?? ''}\u0000${s.text}`
}

function preview(text: string, room: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= room ? flat : `${flat.slice(0, Math.max(1, room - 1))}…`
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** A selection worth offering: non-empty once marks are stripped. */
function excerptOf(s: Selection | undefined): Selection | null {
  if (s === undefined) return null
  const text = stripMarks(s.text).trim()
  return text === '' ? null : { text, requestId: s.requestId }
}

/** The draft as it stood when a Comment field opened, by that Annotation's index. */
type DraftWatch = { index?: number; text?: string }

async function poll($: EngineInterface, draft: DraftWatch) {
  const [selection, box] = await Promise.all([$.ui.selection(), $.prompt.read()])

  const isEmpty = box.text.trim() === ''
  if ((await read($, isDraftEmpty)) !== isEmpty) await update($, isDraftEmpty, () => isEmpty)
  // Typing in the prompt after the Comment field opened means the person
  // left it (Esc); Esc itself raises nothing.
  const editing = await read($, commenting)
  if (editing === null || editing !== draft.index) {
    draft.index = editing ?? undefined
    draft.text = box.text
  } else if (box.text !== draft.text) {
    await update($, commenting, () => null)
  }

  const offer = selection !== undefined && excerptOf(selection) !== null && selectionKey(selection) !== (await read($, handled)) ? selection : null
  const shown = await read($, candidate)
  if (offer?.text !== shown?.text || offer?.requestId !== shown?.requestId) {
    await update($, candidate, () => (offer === null ? null : { text: offer.text, requestId: offer.requestId }))
  }
}

type Added = { annotation: Annotation } | { reason: 'nothing' | 'already' }

async function addSelection($: EngineInterface): Promise<Added> {
  const selection = await $.ui.selection()
  const excerpt = excerptOf(selection)
  if (selection === undefined || excerpt === null) return { reason: 'nothing' }
  if (selectionKey(selection) === (await read($, handled))) return { reason: 'already' }

  const source = (excerpt.requestId !== undefined && roles.get(excerpt.requestId)) || 'transcript'
  let annotation: Annotation | undefined
  await update($, pending, list => {
    annotation = { index: list.length + 1, text: excerpt.text, source, rowId: excerpt.requestId }
    return [...list, annotation]
  })
  await update($, handled, () => selectionKey(selection))
  await update($, candidate, () => null)
  await update($, commenting, () => annotation!.index)
  return { annotation: annotation! }
}

async function ignoreSelection($: EngineInterface) {
  const selection = await $.ui.selection()
  if (selection !== undefined) await update($, handled, () => selectionKey(selection))
  await update($, candidate, () => null)
}

async function setComment($: EngineInterface, index: number, value: string) {
  const comment = value.trim()
  await update($, pending, list =>
    list.map(a => (a.index === index ? { ...a, comment: comment === '' ? undefined : comment } : a)),
  )
  await update($, commenting, () => null)
}

async function removeAnnotation($: EngineInterface, index: number) {
  await update($, pending, list =>
    list.filter(a => a.index !== index).map((a, i) => ({ ...a, index: i + 1 })),
  )
  await update($, commenting, at => (at === null || at === index ? null : at > index ? at - 1 : at))
  if ((await read($, pending)).length === 0) await update($, isListOpen, () => false)
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
  const key = hashText(rewritten)
  const kept = Object.entries(await read($, originals)).filter(([k]) => k !== key)
  const next = Object.fromEntries([...kept.slice(-(MAX_ORIGINALS - 1)), [key, original]])
  await update($, originals, () => next)
  await $.store.set(STORE_ORIGINALS, next)
}

async function clearPending($: EngineInterface) {
  await update($, pending, () => [])
  await update($, commenting, () => null)
  await update($, isListOpen, () => false)
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
    // A reload drops the previous load's timers and fires session.start
    // again, so this is the only interval running.
    const draft: DraftWatch = {}
    $.clock.every(POLL_MS, () => poll($, draft))
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
    if (e.origin.kind !== 'composer') return next(e)
    const list = await read($, pending)
    if (list.length === 0) return next(e)

    const template = await loadTemplate($, options)
    const rendered = renderTemplate(template, e.text, list)
    let entered
    if (usesRequest(template)) {
      await rememberOriginal($, rendered, { text: e.text, count: list.length })
      entered = await next({ ...e, text: rendered })
    } else {
      entered = await next({ ...e, context: [...(e.context ?? []), rendered] })
    }
    if (!('drop' in entered)) await clearPending($)
    return entered
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.requestId !== undefined) roles.set(e.requestId, 'claude')
    const marks = (await read($, pending)).filter(a => a.rowId !== undefined && a.rowId === e.requestId)
    const text = drawMarks(drawCitations(e.props.text), marks, 'assistant')
    return text === e.props.text ? next(e) : next({ ...e, props: { ...e.props, text } })
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (e.props.origin.kind !== 'composer') return next(e)
    if (e.requestId !== undefined && e.requestId !== 'placeholder') roles.set(e.requestId, 'you')
    if (e.props.isExpanded) return next(e)

    const original = (await read($, originals))[hashText(e.props.text)]
    const marks = (await read($, pending)).filter(a => a.rowId !== undefined && a.rowId === e.requestId)
    let text = drawMarks(original?.text ?? e.props.text, marks, 'user')
    if (original !== undefined) text += `\n📎 ${plural(original.count, 'annotation')}`
    return text === e.props.text ? next(e) : next({ ...e, props: { ...e.props, text } })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || e.surface === 'mobile') return next(e)
    const offer = await read($, candidate)
    const list = await read($, pending)
    const editing = await read($, commenting)
    if (offer === null && list.length === 0 && editing === null) return next(e)

    const isOpen = await read($, isListOpen)
    const isEmpty = await read($, isDraftEmpty)
    const columns = e.props.bodyColumns
    const { Box, Button, Input, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {offer !== null && (
          <Box>
            <Button
              key="add"
              variant="primary"
              label="Add to chat"
              onPress={async () => {
                const added = await addSelection($)
                // A click leaves the keyboard with the prompt, so this only
                // moves the ring when the band was focused (ctrl+x tab).
                if ('annotation' in added) {
                  await $.ui.focus({ requestId: e.requestId, key: `comment-${added.annotation.index}` }).catch(() => undefined)
                }
              }}
            />
            <Text dimColor> "{preview(offer.text, columns - 24)}" </Text>
            <Button key="ignore" plain label="×" onPress={() => ignoreSelection($)} />
          </Box>
        )}
        {editing !== null && (
          <Box>
            <Text>{circled(editing)} </Text>
            <Input
              key={`comment-${editing}`}
              placeholder="Add an optional comment… (click here to type)"
              submitLabel="save"
              autoFocus
              onSubmit={value => setComment($, editing, value)}
            />
          </Box>
        )}
        {list.length > 0 && (
          <Box>
            <Button key="list" plain onPress={() => update($, isListOpen, open => !open)}>
              {isOpen ? '▾' : '▸'} {plural(list.length, 'annotation')}
            </Button>
            {isEmpty && <Text> </Text>}
            {isEmpty && <Button key="send" label="Send" onPress={() => $.prompt.fill({ text: SEND_PLACEHOLDER })} />}
            {isEmpty && <Text dimColor> fills the prompt; press Enter to send</Text>}
          </Box>
        )}
        {isOpen &&
          list.map(a => {
            const head = `${circled(a.index)} ${SOURCE_LABEL[a.source]}: `
            const tail = a.comment === undefined ? '' : ` — ${a.comment}`
            return (
              <Box key={`row-${a.index}`}>
                <Text>
                  {head}"{preview(a.text, columns - head.length - tail.length - 6)}"
                  <Text dimColor>{tail}</Text>{' '}
                </Text>
                <Button key={`remove-${a.index}`} plain label="×" onPress={() => removeAnnotation($, a.index)} />
              </Box>
            )
          })}
      </Box>
    )
  })
}
