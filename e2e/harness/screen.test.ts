import assert from 'node:assert/strict'
import { test } from 'node:test'

import { bandRows, isBandRow, locate } from './screen.ts'

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

test('bandRows keeps the rows led by the accent bar', () => {
  assert.deepEqual(bandRows('  ▎ a quote\n▎ 📎 1 annotation\nother'), ['▎ 📎 1 annotation'])
})

test('locate can keep to some rows, counting only theirs', () => {
  assert.deepEqual(locate('a cat\n▎ a cat', 'cat', 1, isBandRow), { x: 5, y: 2, width: 3 })
})
