import { describe, expect, test } from 'claude-code/testing'

import { drawCitations, drawMarks, markOffset, stripMarks } from '../hooks/excerpt'

// The reply and selections measured in docs/spikes.md §2.
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

  test('a prompt row keeps link syntax', () => {
    const excerpt = 'Run npm test before you commit the change, then read [the guide](https://example.com/guide) for details.'
    expect(markOffset(PROMPT, excerpt, 'user')).toBeDefined()
    expect(markOffset(PROMPT, excerpt, 'assistant')).toBeUndefined()
  })

  test('the mark goes after closing delimiters, never inside them', () => {
    expect(drawMarks(REPLY, [{ index: 1, text: 'commit the change' }], 'assistant')).toContain('**commit the change**`⁽¹⁾`,')
    expect(drawMarks(REPLY, [{ index: 2, text: 'npm test' }], 'assistant')).toContain('`npm test``⁽²⁾`')
    expect(drawMarks(REPLY, [{ index: 3, text: 'the guide' }], 'assistant')).toContain('(https://example.com/guide)`⁽³⁾` for')
  })

  test('a match ending mid code span gets a bare mark inside the span', () => {
    expect(drawMarks(REPLY, [{ index: 1, text: 'Run npm' }], 'assistant')).toStartWith('Run `npm⁽¹⁾ test`')
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

  test('stripMarks removes superscript and circled marks', () => {
    expect(stripMarks('a⁽¹²⁾ b ③')).toBe('a b ')
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
})
