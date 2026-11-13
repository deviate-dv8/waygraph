import { test } from '@japa/runner'
import type { RunDetail, StepCall } from '#types/project'
import { pageNetwork } from '#services/page_network'

const call = (over: Partial<StepCall>): StepCall => ({
  source: 'page',
  method: 'GET',
  url: 'http://a/x',
  route: '/x',
  status: 200,
  ms: 10,
  size: null,
  failed: false,
  external: false,
  body: null,
  ...over,
})

test('a page lists its calls and what is wrong with them', ({ assert }) => {
  const run = {
    stepsList: [
      {
        to: 'Items',
        calls: [
          call({}),
          call({}),
          call({ url: 'http://a/slow', route: '/slow', ms: 2000 }),
          call({ url: 'http://cdn/b', route: '/b', external: true, ms: 9000 }),
        ],
      },
    ],
  } as unknown as RunDetail
  const items = pageNetwork([run]).Items
  assert.deepEqual(items.calls.map((c) => c.name).sort(), ['GET /slow', 'GET /x'])
  assert.deepEqual(items.findings.map((f) => f.kind).sort(), ['duplicate', 'slow'])
})
