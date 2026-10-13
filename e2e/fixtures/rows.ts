// The rows of transcript.jsonl as Claude Code draws them, one entry per
// kind, and what adding text from each must give. Scenarios select from
// these; after re-recording (record.ts), check the texts still show.

export type Source = 'claude' | 'you' | 'transcript'

export type FixtureRow = {
  kind: string
  /** Text shown in that row, picked so it is not at a line end (a drag there takes the newline). */
  text: string
  /** Which occurrence on screen, when the text shows more than once. */
  nth?: number
  source: Source
  /** The ui.render component the row is drawn as; undefined: one no hook sees. */
  components?: readonly string[]
  /** What the row shows once the Annotation is pending: where its mark lands. */
  mark?: 'after' | 'head'
  /** For `mark: 'after'`: the text the mark follows, when not `text` itself. */
  markAfter?: string
}

/** Rows from the person's prompt and Claude's replies: they get marks. */
export const REPLY_ROWS: readonly FixtureRow[] = [
  { kind: 'your prompt', text: 'Read the file missing.txt', source: 'you', components: ['UserMessage'], mark: 'after' },
  { kind: 'reply text', text: 'running or done', source: 'claude', components: ['AssistantMessage'], mark: 'after' },
  { kind: 'table cell', text: 'replied SUB-OK the answer is 42', source: 'claude', components: ['AssistantMessage'], mark: 'after' },
  { kind: 'blockquote', text: 'so reading it failed', source: 'claude', components: ['AssistantMessage'], mark: 'after' },
  { kind: 'nested list item', text: 'Defines add(a, b) and greet', source: 'claude', components: ['AssistantMessage'], mark: 'after' },
  { kind: 'numbered list item', text: 'Ran the', source: 'claude', components: ['AssistantMessage'], mark: 'after' },
  { kind: 'link text', text: 'Read the notes', source: 'claude', components: ['AssistantMessage'], mark: 'after', markAfter: 'the notes (https://example.com/notes)' },
  { kind: 'inline code', text: 'snake_case_name', source: 'claude', components: ['AssistantMessage'], mark: 'after' },
  { kind: 'CJK text', text: '混合中文', source: 'claude', components: ['AssistantMessage'], mark: 'after' },
  { kind: 'emoji', text: 'emoji 🚀 with', source: 'claude', components: ['AssistantMessage'], mark: 'after' },
  { kind: 'strikethrough (drawn with its tildes)', text: '~~struck~~', source: 'claude', components: ['AssistantMessage'], mark: 'after' },
  { kind: 'table row across cells', text: 'Subagent           │ Done', source: 'claude', components: ['AssistantMessage'], mark: 'head' },
  { kind: 'code block', text: 'print("hi " + name', source: 'claude', components: ['AssistantMessage'], mark: 'head' },
  { kind: 'reply to a plugin prompt', text: 'PLUGIN-AC', nth: 2, source: 'claude', components: ['AssistantMessage'], mark: 'after' },
]

/** Rows no Annotation can be pinned to a reply or a prompt: Source transcript, no marks. */
export const OTHER_ROWS: readonly FixtureRow[] = [
  { kind: 'tool call', text: 'Agent(Subagent reply', source: 'transcript', components: ['ToolUse', 'ToolResult'] },
  { kind: 'tool result', text: 'Backgrounded agent', source: 'transcript', components: ['ToolUse', 'ToolResult'] },
  { kind: 'collapsed tool group', text: 'Read 3 files, ran 1 shell', source: 'transcript', components: ['ToolGroup'] },
  { kind: 'turn duration', text: 'Crunched for 7s', source: 'transcript', components: ['TurnDuration'] },
  { kind: 'subagent notification', text: 'Subagent reply check" finished', source: 'transcript', components: ['UserMessage'] },
  { kind: 'background command notification', text: 'Background command "Sleep 4', source: 'transcript', components: ['UserMessage'] },
  { kind: 'bash-mode input', text: 'echo BANG-MODE', source: 'transcript' },
  { kind: 'bash-mode output', text: 'BANG-MODE outpu', nth: 2, source: 'transcript' },
  { kind: 'slash command input', text: '/probe-ou', source: 'transcript' },
  { kind: 'command output', text: 'PROBE-OUT line two', source: 'transcript', components: ['CommandOutput'] },
  { kind: 'plugin prompt header', text: 'Prompt from the atc-probe', source: 'transcript' },
  { kind: 'plugin prompt', text: 'PLUGIN-PROMPT: reply with exactly', source: 'transcript' },
]
