import { expect, test } from 'claude-code/testing'

import type { Annotation } from '../types'
import { DEFAULT_TEMPLATE, renderTemplate, usesRequest } from '../hooks/template'
import { XML_TEMPLATE } from './world'

const ANNOTATIONS: Annotation[] = [
  { index: 1, text: 'npm test', source: 'claude', rowId: 'r1', comment: 'why this?' },
  { index: 2, text: 'my earlier idea', source: 'you', rowId: 'u1' },
]


test('the default template rewrites the prompt with Codex-style JSON', () => {
  expect(usesRequest(DEFAULT_TEMPLATE)).toBe(true)
  const out = renderTemplate(DEFAULT_TEMPLATE, 'compare these', ANNOTATIONS)
  expect(out).toStartWith('# Response annotations:')
  expect(out).toEndWith('## My request:\ncompare these')
  const json = JSON.parse(out.split('<response-annotations>\n')[1]!.split('\n</response-annotations>')[0]!)
  expect(json).toEqual([
    { text: 'npm test', source: { role: 'claude', rowId: 'r1' }, comment: 'why this?' },
    { text: 'my earlier idea', source: { role: 'you', rowId: 'u1' } },
  ])
})

test('the XML template rides in context, one element per annotation', () => {
  expect(usesRequest(XML_TEMPLATE)).toBe(false)
  expect(renderTemplate(XML_TEMPLATE, 'ignored', ANNOTATIONS)).toBe(
    `The user selected these excerpts from earlier in the conversation; their prompt refers to them by number.
<annotation n="1" source="claude">
<excerpt>npm test</excerpt>
<comment>why this?</comment>
</annotation>
<annotation n="2" source="you">
<excerpt>my earlier idea</excerpt>

</annotation>
`,
  )
})

test('globals, inverted sections and unknown tags', () => {
  expect(renderTemplate('{{count}} for {{ request }}{{^none}}!{{/none}}{{missing}}', 'me', ANNOTATIONS)).toBe('2 for me!')
})

test('an empty request renders empty', () => {
  expect(renderTemplate('[{{request}}]', '', ANNOTATIONS)).toBe('[]')
})
