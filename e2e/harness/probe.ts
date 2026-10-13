// Reading what the probe plugin (e2e/probe) recorded about a session.
import { readFile } from 'node:fs/promises'

import { waitFor } from './exec.ts'

export type Selection = { text: string; requestId?: string }
export type Annotation = { index: number; text: string; source: 'claude' | 'you' | 'transcript'; rowId?: string; comment?: string }
export type AddToChatState = { pending: Annotation[]; candidate: Selection | null; commenting: number | null }
export type Row = { component: string; requestId?: string; text?: string; tool?: string; origin?: { kind: string } }
export type Submit = { origin: { kind: string }; text: string; context: string[]; dropped: boolean }

type Event =
  | { kind: 'session'; t: number; id: string; cwd: string }
  | { kind: 'selection'; t: number; selection: Selection | null }
  | { kind: 'state'; t: number } & AddToChatState
  | { kind: 'row'; t: number } & Row
  | { kind: 'submit'; t: number } & Submit
  | { kind: 'turn'; t: number; phase: 'start' | 'complete' }
  | { kind: 'toast'; t: number; text: string }

export class ProbeLog {
  readonly file: string

  constructor(file: string) {
    this.file = file
  }

  async events(): Promise<Event[]> {
    const text = await readFile(this.file, 'utf8').catch(() => '')
    return text
      .split('\n')
      .filter(Boolean)
      .flatMap(line => {
        try {
          return [JSON.parse(line) as Event]
        } catch {
          return [] // a line still being written
        }
      })
  }

  async of<K extends Event['kind']>(kind: K): Promise<Extract<Event, { kind: K }>[]> {
    return (await this.events()).filter((e): e is Extract<Event, { kind: K }> => e.kind === kind)
  }

  async session(): Promise<{ id: string; cwd: string }> {
    return waitFor('the probe to see the session start', async () => (await this.of('session')).at(-1), { timeoutMs: 30_000 })
  }

  async selection(): Promise<Selection | null> {
    return (await this.of('selection')).at(-1)?.selection ?? null
  }

  async state(): Promise<AddToChatState> {
    const last = (await this.of('state')).at(-1)
    return { pending: last?.pending ?? [], candidate: last?.candidate ?? null, commenting: last?.commenting ?? null }
  }

  async pending(): Promise<Annotation[]> {
    return (await this.state()).pending
  }

  /** The component a transcript row was drawn as, by its requestId. */
  async componentOf(requestId: string | undefined): Promise<string | undefined> {
    if (requestId === undefined) return undefined
    return (await this.of('row')).find(r => r.requestId === requestId)?.component
  }

  async submits(): Promise<Submit[]> {
    return this.of('submit')
  }

  async toasts(): Promise<string[]> {
    return (await this.of('toast')).map(t => t.text)
  }

  async turnsCompleted(): Promise<number> {
    return (await this.of('turn')).filter(t => t.phase === 'complete').length
  }

  async isWorking(): Promise<boolean> {
    const turns = await this.of('turn')
    return turns.at(-1)?.phase === 'start'
  }
}
