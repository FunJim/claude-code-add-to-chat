// The run's report: a Markdown page and a JSON file beside the evidence.
import { writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

import type { Result } from './scenario.ts'

export type RunInfo = {
  driver: string
  startedAt: Date
  claudeVersion: string
  model: string
  mainSize: { cols: number; rows: number }
  watchCommand: string
}

const MARK = { pass: '✔', fail: '✘', skip: '–' } as const

export type Summary = { pass: number; fail: number; skip: number }

export function summarize(results: readonly Result[]): Summary {
  const by = (s: Result['status']) => results.filter(r => r.status === s).length
  return { pass: by('pass'), fail: by('fail'), skip: by('skip') }
}

/** The run's outcome in one line. */
export function verdict(s: Summary): string {
  return `${s.fail === 0 ? '✔ PASSED' : '✘ FAILED'} — ${s.pass} passed, ${s.fail} failed, ${s.skip} skipped`
}

export async function writeReport(runDir: string, info: RunInfo, unordered: readonly Result[]): Promise<string> {
  const results = [...unordered].sort((a, b) => a.order - b.order)
  const s = summarize(results)
  const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`
  const total = results.reduce((n, r) => n + r.ms, 0)
  const lines = [
    `# add-to-chat end-to-end run`,
    '',
    `**${verdict(s)}**, in ${seconds(total)}`,
    '',
    '| | |',
    '|---|---|',
    `| Driver | ${info.driver} (main terminal ${info.mainSize.cols}×${info.mainSize.rows} cells) |`,
    `| Claude Code | ${info.claudeVersion} |`,
    `| Model | ${info.model} |`,
    `| Started | ${info.startedAt.toISOString()} |`,
    '',
    '| | Group | Scenario | Model | Time |',
    '|---|---|---|---|---|',
    ...results.map(r => `| ${MARK[r.status]} | ${r.group} | ${r.title} | ${r.usesModel ? info.model : '—'} | ${r.status === 'skip' ? '' : seconds(r.ms)} |`),
  ]
  const failed = results.filter(r => r.status === 'fail')
  if (failed.length > 0) {
    lines.push('', '## Failures')
    for (const r of failed) {
      lines.push('', `### ${r.group} › ${r.title}`, '', '```', r.error ?? '', '```')
      for (const e of r.evidence) lines.push(`- [${e.label}](${relative(runDir, e.file)})`)
    }
  }
  const kept = results.filter(r => r.status === 'pass' && r.evidence.length > 0)
  if (kept.length > 0) {
    lines.push('', '## Evidence')
    for (const r of kept) lines.push(`- ${r.group} › ${r.title}: ${r.evidence.map(e => `[${e.label}](${relative(runDir, e.file)})`).join(', ')}`)
  }
  const file = join(runDir, 'report.md')
  await writeFile(file, `${lines.join('\n')}\n`)
  await writeFile(join(runDir, 'results.json'), `${JSON.stringify({ info, summary: s, results }, null, 2)}\n`)
  return file
}
