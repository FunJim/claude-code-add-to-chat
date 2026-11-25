// Claude Code versions, as `claude --version` prints them ("2.1.332 (Claude
// Code)"): whether a session's engine has what a scenario needs.

function parts(version: string): number[] {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(version)
  if (m === null) throw new Error(`not a Claude Code version: ${version}`)
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

/** Whether `version` is `since` or later. */
export function isAtLeast(version: string, since: string): boolean {
  const [a, b] = [parts(version), parts(since)]
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i]! > b[i]!
  return true
}
