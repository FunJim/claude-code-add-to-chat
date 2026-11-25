import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isAtLeast } from './version.ts'

test('a version is at least another by its numbers, not its text', () => {
  assert.equal(isAtLeast('2.1.332 (Claude Code)', '2.1.325'), true)
  assert.equal(isAtLeast('2.1.325', '2.1.325'), true)
  assert.equal(isAtLeast('2.1.300 (Claude Code)', '2.1.325'), false)
  assert.equal(isAtLeast('2.1.1000', '2.1.325'), true)
  assert.equal(isAtLeast('3.0.0', '2.9.9'), true)
  assert.throws(() => isAtLeast('dev', '2.1.300'))
})
