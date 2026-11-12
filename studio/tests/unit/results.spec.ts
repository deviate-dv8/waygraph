import { test } from '@japa/runner'
import type { RunDetail, RunStep } from '#types/project'
import { lastResults } from '#services/results'

const step = (block: string, status: RunStep['status'], ms: number): RunStep =>
  ({
    index: 0,
    block,
    kind: 'method',
    from: 'A',
    to: 'A',
    ms,
    status,
    url: null,
    error: null,
    check: null,
    read: null,
    cleanup: false,
    parent: null,
    screenshot: null,
    pane: null,
    diffs: [],
  }) as RunStep
const run = (id: string, startedAt: number, steps: RunStep[]) =>
  ({ id, startedAt, stepsList: steps }) as unknown as RunDetail

test.group('results', () => {
  test('a Block last went as its newest run says; a running or cleanup step says nothing', ({
    assert,
  }) => {
    const results = lastResults([
      run('old', 1, [step('fill', 'failed', 5), step('save', 'passed', 7)]),
      run('new', 2, [step('fill', 'passed', 3), step('wait', 'running', 0)]),
    ])
    assert.deepEqual(results['fill'], { ok: true, runId: 'new', ms: 3 })
    assert.deepEqual(results['save'], { ok: true, runId: 'old', ms: 7 })
    assert.isUndefined(results['wait'])
  })
})
