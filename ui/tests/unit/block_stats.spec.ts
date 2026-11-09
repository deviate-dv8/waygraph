import { test } from '@japa/runner'
import { blockStats } from '#services/block_stats'
import type { RunDetail, RunStep } from '#types/project'

const step = (
  index: number,
  block: string,
  from: string,
  to: string | null,
  url: string | null,
  status: RunStep['status'] = 'passed',
  ms = 100
) => ({ index, block, from, to, url, status, ms, cleanup: false, parent: null }) as RunStep
const run = (steps: RunStep[]) => ({ stepsList: steps }) as RunDetail

test.group('blockStats', () => {
  test('a step that ends on another path navigates; one that changes only the query changes the address', ({
    assert,
  }) => {
    const stats = blockStats([
      run([
        step(0, 'nav-add', '*', 'Add', 'http://app/equipment/new'),
        step(1, 'submit', 'Add', 'Detail', 'http://app/equipment/42', 'passed', 300),
        step(2, 'open-stations-tab', 'Detail', 'Detail', 'http://app/equipment/42?tab=stations'),
        step(3, 'fill-name', 'Detail', 'Detail', 'http://app/equipment/42?tab=stations'),
      ]),
      run([
        step(0, 'nav-add', '*', 'Add', 'http://app/equipment/new'),
        step(1, 'submit', 'Add', null, null, 'failed', 100),
      ]),
    ])
    assert.deepEqual(stats.submit.moves, [
      { from: '/equipment/new', to: '/equipment/42', count: 1 },
    ])
    assert.equal(stats.submit.runs, 2)
    assert.equal(stats.submit.failed, 1)
    assert.equal(stats.submit.ms, 200)
    assert.equal(stats['open-stations-tab'].addressOnly, 1)
    assert.deepEqual(stats['open-stations-tab'].moves, [])
    assert.equal(stats['fill-name'].addressOnly, 0)
    // The run's first step has no address before it.
    assert.deepEqual(stats['nav-add'].moves, [])
  })
})
