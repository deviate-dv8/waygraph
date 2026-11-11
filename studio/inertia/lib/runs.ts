import type { RunSummary } from '#types/project'

/** What a run played, in words: its flows, or (a test's run, whose log names none) its first and last step. */
export function runTitle(run: RunSummary): string {
  if (run.flows.length) return run.flows.join(', ')
  if (!run.firstStep) return 'empty run'
  return run.firstStep === run.lastStep ? run.firstStep : `${run.firstStep} → ${run.lastStep}`
}
