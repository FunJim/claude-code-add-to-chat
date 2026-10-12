export type ProbeSel = { text: string; requestId?: string } | null

declare module 'claude-code' {
  interface PluginState {
    'atc-probe': { sel: ProbeSel; presses: number }
  }
}
