// The Annotation Template: what the model reads for a prompt sent with
// Annotations, which replaces the prompt.

import type { Annotation } from '../types'

/**
 * Between the Annotations and the request: what they are, and how to cite
 * them.
 */
const INSTRUCTIONS = `These are passages the user selected from earlier in this conversation (source: assistant = your reply, user = their own prompt, tool = a tool call or result, system = a Claude Code notice), each with the user's comment when they wrote one; their request below refers to them. Take every annotation into account and answer every comment.
When a sentence of your reply addresses an annotation, end it with :annotation{index="N"}, N being that annotation's index; the user's screen shows it as that annotation's number (①). Write it instead of naming "Annotation N" in prose, and keep it out of code blocks.`

/** XML text or attribute value: nothing in it can close or open a tag. */
function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** One Annotation as an `<annotation>` element, its values escaped. */
function toXml(a: Annotation): string {
  const id = a.requestId === undefined ? '' : ` requestId="${escapeXml(a.requestId)}"`
  return [
    `<annotation index="${a.index}" source="${a.source}"${id}>`,
    `<excerpt>${escapeXml(a.text)}</excerpt>`,
    ...(a.comment === undefined ? [] : [`<comment>${escapeXml(a.comment)}</comment>`]),
    '</annotation>',
  ].join('\n')
}

/**
 * The data first, the instructions after it, the request last; each
 * Annotation's index in the data, so the model never counts from zero.
 */
export function renderTemplate(request: string, annotations: readonly Annotation[]): string {
  return `<annotations>\n${annotations.map(toXml).join('\n')}\n</annotations>\n\n${INSTRUCTIONS}\n\n<request>\n${request}\n</request>`
}
