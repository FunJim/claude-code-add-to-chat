export type AnnotationSource = 'claude' | 'you' | 'transcript'

export type Annotation = {
  /** One-based, renumbered when one is removed. */
  index: number
  /** The Excerpt, marks stripped. */
  text: string
  source: AnnotationSource
  /** The transcript row it was selected in, when it lies in one. */
  rowId?: string
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
      /** The index whose Comment field the band shows. */
      commenting: number | null
      isListOpen: boolean
      isDraftEmpty: boolean
      /** Keyed by `hashText` of the rewritten prompt; mirrored in `$.store`. */
      originals: Record<string, Original>
    }
  }
}
