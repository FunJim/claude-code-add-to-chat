import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isRule, locate, paneArea, textIn, transcriptArea } from './screen.ts'

test('locate counts wide characters as two cells', () => {
  const screen = 'first row\n  混合中文 and emoji 🚀 with snake_case'
  assert.deepEqual(locate(screen, 'snake_case'), { x: 30, y: 2, width: 10 })
  assert.deepEqual(locate(screen, '中文'), { x: 7, y: 2, width: 4 })
})

test('locate finds the nth occurrence across rows', () => {
  const screen = 'a cat\nthe cat and the cat'
  assert.deepEqual(locate(screen, 'cat', 3), { x: 17, y: 2, width: 3 })
  assert.equal(locate(screen, 'cat', 4), undefined)
})

const RULE = '─'.repeat(40)

test('a docked pane: the transcript left of its border, the pane right of it', () => {
  const screen = [
    'the cat sat    │               ✕',
    'on the mat     │✚ Add to chat “cat”',
    '中文 cat       │1: Claude ✕',
    '               │“the cat”',
    RULE,
    '❯ draft',
    RULE,
  ].join('\n')
  const pane = paneArea(screen)!
  assert.deepEqual(pane, { top: 1, bottom: 4, left: 17, right: 40 })
  assert.deepEqual(transcriptArea(screen), { top: 1, bottom: 4, left: 1, right: 15 })
  assert.deepEqual(locate(screen, 'cat', 1, pane), { x: 32, y: 2, width: 3 })
  assert.deepEqual(locate(screen, 'cat', 2, transcriptArea(screen)), { x: 6, y: 3, width: 3 })
  assert.equal(textIn(screen, pane)[2], '1: Claude ✕')
})

test('an inline pane: framed above the prompt, the transcript above it', () => {
  const screen = ['the cat sat', '╭──────────✕─╮', '│ 1: Claude ✕│', '│ “the cat”  │', '╰────────────╯', RULE, '❯', RULE].join('\n')
  const pane = paneArea(screen)!
  assert.deepEqual(pane, { top: 3, bottom: 4, left: 3, right: 38 })
  assert.deepEqual(transcriptArea(screen), { top: 1, bottom: 1, left: 1, right: 40 })
  assert.deepEqual(locate(screen, 'cat', 1, pane), { x: 8, y: 4, width: 3 })
})

test('no pane: the transcript is everything above the prompt box', () => {
  const screen = ['a', 'b', RULE, '❯', RULE].join('\n')
  assert.equal(paneArea(screen), undefined)
  assert.deepEqual(transcriptArea(screen), { top: 1, bottom: 2, left: 1, right: 40 })
})

test('a rule: plain, or labelled while browsing the prompt history; not a frame or a text line', () => {
  assert.ok(isRule('─'.repeat(40)))
  assert.ok(isRule(`─── History 1/3 ${'─'.repeat(40)}`))
  assert.ok(!isRule(`╭${'─'.repeat(40)}╮`))
  assert.ok(!isRule('── a heading drawn in text ──'))
})
