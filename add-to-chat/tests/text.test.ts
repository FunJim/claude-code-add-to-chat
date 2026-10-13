import { expect, test } from 'claude-code/testing'

import { cells, preview } from '../hooks/text'

test('wide characters take two cells', () => {
  expect(['a', '中', '🚀', '📎', 'ア', '한', '㉑'].map(cells)).toEqual([1, 2, 2, 2, 2, 2, 2])
  // Symbols the transcript and the band draw stay one cell.
  expect(['⏺', '✚', '✕', '⎿', '①', '▎', '✻'].map(cells)).toEqual([1, 1, 1, 1, 1, 1, 1])
})

test('preview fits the room in cells, not characters', () => {
  expect(preview('short', 10)).toBe('short')
  expect(preview('abcdefghij', 6)).toBe('abcde…')
  expect(preview('混合中文混合中文', 7)).toBe('混合中…')
  expect(preview('a🚀b🚀c', 5)).toBe('a🚀b…')
})

test('preview puts the text on one line', () => {
  expect(preview('one\n\n  two\tthree', 40)).toBe('one two three')
})

test('a tiny room still shows a character and the ellipsis', () => {
  expect(preview('abcdef', 0)).toBe('a…')
})
