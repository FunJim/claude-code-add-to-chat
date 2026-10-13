/**
 * Where an Excerpt was selected: a reply, the person's prompt, a tool's row,
 * a notice or other row of Claude Code's own, or no single row.
 */
export type AnnotationSource = 'assistant' | 'user' | 'tool' | 'system' | 'transcript'

export type Annotation = {
  /** One-based, renumbered when one is removed. */
  index: number
  /** The Excerpt, marks stripped. */
  text: string
  source: AnnotationSource
  /** The transcript row it was selected in (`$.ui.selection()`'s `requestId`), when it lies in one. */
  requestId?: string
  comment?: string
}

/** A selection the band offers to add. */
export type Candidate = { text: string; requestId?: string }

/** What a rewritten prompt row draws instead of the rendered template. */
export type Original = { text: string; count: number }

declare module 'claude-code' {
  interface PluginState {
    'add-to-chat': {
      pending: Annotation[]
      candidate: Candidate | null
      /** `selectionKey` of the selection last added or ignored; outlives a submit. */
      handled: string | null
      /** Whether the pane is open, as the poll last saw `$.ui.panes()`. */
      isPaneOpen: boolean
      /** The person closed the pane: it stays closed until /add-to-chat. */
      isPaneDismissed: boolean
      /** The index of the Annotation whose tab the pane shows. */
      paneTab: number
      isDraftEmpty: boolean
      /** Keyed by `hashText` of the rewritten prompt; mirrored in `$.store`. */
      originals: Record<string, Original>
    }
  }
}
