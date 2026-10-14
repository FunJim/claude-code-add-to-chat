import { describe, expect, test } from 'claude-code/testing'

import { drawCitations, drawMarks, markOffset, stripMarks } from '../hooks/excerpt'
import { circled } from '../hooks/labels'

// The reply and selections measured in docs/claude-code-notes.md, "Matching Excerpts against markdown".
const REPLY =
  'Run `npm test` before you **commit the change**, then read [the guide](https://example.com/guide) for details. Plain sentence for MARKTEST here.\n\nSecond paragraph with *italic words* and a `foo_bar()` call.\n\n- list item one\n- list item two with `code`'
const PROMPT =
  'Reply with exactly: "Run `npm test` before you **commit the change**, then read [the guide](https://example.com/guide) for details."'

describe('matching an Excerpt in markdown', () => {
  const found: [string, string][] = [
    ['inline code, bold and a link', 'npm test before you commit the change, then read the guide'],
    ['code only', 'foo_bar()'],
    ['italic', 'italic words'],
    ['link text', 'the guide'],
    ['list item with code', 'list item two with code'],
    ['across paragraphs', 'MARKTEST here.\n\nSecond paragraph with italic words and a foo'],
    ['across list items', 'item one\n- list item two'],
    ['a mark selected along', 'sentence for MARKTEST⁽¹⁾ here.'],
  ]
  for (const [name, excerpt] of found) {
    test(`finds: ${name}`, () => {
      expect(markOffset(REPLY, excerpt, 'assistant')).toBeDefined()
    })
  }

  test('strikethrough is drawn with its tildes, so they match', () => {
    const md = 'with __bold__, _italic_, ~~struck~~ and `snake_case_name`.'
    expect(drawMarks(md, [{ index: 1, text: '~~struck~~' }], 'assistant')).toBe(
      'with __bold__, _italic_, ~~struck~~`⁽¹⁾` and `snake_case_name`.',
    )
    expect(drawMarks(md, [{ index: 2, text: 'bold, italic' }], 'assistant')).toBe(
      'with __bold__, _italic_`⁽²⁾`, ~~struck~~ and `snake_case_name`.',
    )
  })

  test('a prompt row keeps link syntax', () => {
    const excerpt = 'Run npm test before you commit the change, then read [the guide](https://example.com/guide) for details.'
    expect(markOffset(PROMPT, excerpt, 'user')).toBeDefined()
    expect(markOffset(PROMPT, excerpt, 'assistant')).toBeUndefined()
  })

  test('the mark goes after closing delimiters, never inside them', () => {
    expect(drawMarks(REPLY, [{ index: 1, text: 'commit the change' }], 'assistant')).toContain('**commit the change**`⁽¹⁾`,')
    expect(drawMarks(REPLY, [{ index: 2, text: 'npm test' }], 'assistant')).toContain('`npm test⁽²⁾`')
    expect(drawMarks(REPLY, [{ index: 3, text: 'the guide' }], 'assistant')).toContain('(https://example.com/guide)`⁽³⁾` for')
  })

  test('a match ending mid code span gets a bare mark inside the span', () => {
    expect(drawMarks(REPLY, [{ index: 1, text: 'Run npm' }], 'assistant')).toStartWith('Run `npm⁽¹⁾ test`')
  })

  test('a match ending a code span marks inside it, never fusing backticks', () => {
    expect(drawMarks('Prefer `const` over `let` when', [{ index: 1, text: 'Prefer const over let' }], 'assistant')).toBe(
      'Prefer `const` over `let⁽¹⁾` when',
    )
  })

  test('a mark right before a code span keeps its own backticks apart', () => {
    expect(drawMarks('foo`bar`', [{ index: 1, text: 'foo' }], 'assistant')).toBe('foo`⁽¹⁾`\u200b`bar`')
  })

  test('an opening delimiter after the match stays put', () => {
    expect(drawMarks('foo**bar** baz', [{ index: 1, text: 'foo' }], 'assistant')).toBe('foo`⁽¹⁾`**bar** baz')
  })

  test('only the first occurrence is marked', () => {
    expect(drawMarks('a cat and a cat', [{ index: 1, text: 'cat' }], 'assistant')).toBe('a cat`⁽¹⁾` and a cat')
  })

  test('several marks on one row', () => {
    expect(drawMarks('one two three', [{ index: 1, text: 'one' }, { index: 2, text: 'three' }], 'assistant')).toBe(
      'one`⁽¹⁾` two three`⁽²⁾`',
    )
  })

  test('falls back to the head of the row when the Excerpt is not found', () => {
    expect(drawMarks('Hello world', [{ index: 1, text: 'not here' }], 'assistant')).toBe('`①` Hello world')
  })

  test('falls back on its own line before a block', () => {
    expect(drawMarks('# Title\n\nbody', [{ index: 2, text: 'nope' }], 'assistant')).toBe('`②`\n\n# Title\n\nbody')
  })

  test('an Excerpt ending inside a code block falls back', () => {
    const md = 'See:\n\n```ts\nconst x = 1\n```\n'
    expect(markOffset(md, 'const x = 1', 'assistant')).toBeUndefined()
    expect(drawMarks(md, [{ index: 1, text: 'const x = 1' }], 'assistant')).toStartWith('`①` See:')
  })

  test('marks already drawn do not break a later match', () => {
    const marked = drawMarks(REPLY, [{ index: 1, text: 'commit the change' }], 'assistant')
    expect(markOffset(marked, 'commit the change, then read', 'assistant')).toBeDefined()
  })

  test('circled numbers run to fifty', () => {
    expect([1, 20, 21, 35, 36, 50, 51].map(circled)).toEqual(['①', '⑳', '㉑', '㉟', '㊱', '㊿', '(51)'])
    expect(stripMarks('a㉕b㊿c')).toBe('abc')
  })

  test('stripMarks removes superscript and circled marks', () => {
    expect(stripMarks('a⁽¹²⁾ b ③\u200b')).toBe('a b ')
  })
})

describe('code spans as CommonMark reads them', () => {
  test('an unmatched run of backticks is literal and swallows nothing', () => {
    const md = 'the body of `greet` in the ```py block.\n:annotation{index="15"} Final line with `code`.'
    expect(drawCitations(md)).toBe('the body of `greet` in the ```py block.\n`⑮` Final line with `code`.')
  })

  test('a span closes only on a run of the same length', () => {
    expect(drawCitations('``a ` b`` :annotation{index="1"}')).toBe('``a ` b`` `①`')
  })

  test('a span does not cross a paragraph break', () => {
    expect(drawCitations('open ` here\n\n:annotation{index="2"} and ` there')).toBe('open ` here\n\n`②` and ` there')
  })

  test('literal backticks still match an Excerpt that shows them', () => {
    expect(markOffset('Use ```py fences for code.', 'Use ```py fences', 'assistant')).toBeDefined()
  })
})

describe('Citations', () => {
  test('a directive becomes a coloured number and is not shown', () => {
    const drawn = drawCitations('Fixed it :annotation{index="2"} and that.')
    expect(drawn).toBe('Fixed it `②` and that.')
    expect(drawn).not.toContain(':annotation')
  })

  test('a directive inside code is left as written', () => {
    expect(drawCitations('Use `:annotation{index="1"}` like so')).toBe('Use `:annotation{index="1"}` like so')
  })

  test('a number that names no Annotation stays as written: 0 always, past the count when it is known', () => {
    const md = 'a :annotation{index="0"} b :annotation{index="2"} c :annotation{index="3"}'
    expect(drawCitations(md)).toBe('a :annotation{index="0"} b `②` c `③`')
    expect(drawCitations(md, 2)).toBe('a :annotation{index="0"} b `②` c :annotation{index="3"}')
  })
})
