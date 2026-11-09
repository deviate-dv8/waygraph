import { test } from '@japa/runner'
import { pageFlows } from '#services/page_flows'
import type { Manifest, RunDetail } from '#types/project'

const block = (name: string, from: string[], to: string[]) =>
  ({ name, from, to }) as Manifest['blocks'][number]
const flow = (exportName: string, steps: string[]) =>
  ({ exportName, steps }) as Manifest['flows'][number]
const run = (id: string, ok: boolean | null, landed: string[]) =>
  ({ id, ok, stepsList: landed.map((to) => ({ to })) }) as RunDetail
const PAGES = ['LoginPage', 'Inventory']

test.group('pageFlows', () => {
  test('a page lists the flows that land or act on it, with their newest run', ({ assert }) => {
    const manifest = {
      checkpoints: PAGES,
      blocks: [
        block('nav-login', ['*'], ['LoginPage']),
        block('submit-login', ['LoginPage'], ['Inventory']),
        block('add-to-cart', ['Inventory'], ['Inventory']),
      ],
      flows: [
        flow('loginFlow', ['nav-login', 'submit-login']),
        flow('cartFlow', ['nav-login', 'submit-login', 'add-to-cart']),
      ],
    } as Manifest
    // cartFlow's newest run failed; loginFlow never ran.
    const byPage = pageFlows(
      manifest,
      new Map([['cartFlow', run('b', false, ['LoginPage', 'Inventory'])]])
    )
    assert.notProperty(byPage, '*')
    assert.deepEqual(
      byPage.LoginPage.map((f) => f.name),
      ['loginFlow', 'cartFlow']
    )
    assert.deepEqual(
      byPage.Inventory.find((f) => f.name === 'cartFlow'),
      {
        name: 'cartFlow',
        reach: 'lands',
        ok: false,
        runId: 'b',
      }
    )
    assert.deepEqual(
      byPage.Inventory.find((f) => f.name === 'loginFlow'),
      {
        name: 'loginFlow',
        reach: 'lands',
        ok: null,
        runId: null,
      }
    )
  })

  test('a step with several outcomes lands where the next step starts, else may land on each', ({
    assert,
  }) => {
    const manifest = {
      checkpoints: PAGES,
      blocks: [
        block('submit-login', ['LoginPage'], ['Inventory', 'LoginPage']),
        block('add-to-cart', ['Inventory'], ['Inventory']),
      ],
      flows: [flow('shop', ['submit-login', 'add-to-cart']), flow('blocked', ['submit-login'])],
    } as Manifest
    const byPage = pageFlows(manifest, new Map())
    const reach = (page: string, name: string) => byPage[page]?.find((f) => f.name === name)?.reach
    assert.equal(reach('Inventory', 'shop'), 'lands')
    assert.equal(reach('LoginPage', 'shop'), 'acts')
    assert.equal(reach('Inventory', 'blocked'), 'may land')
    assert.equal(reach('LoginPage', 'blocked'), 'may land')
  })

  test("a flow's newest run says where a step with several outcomes landed", ({ assert }) => {
    const manifest = {
      checkpoints: PAGES,
      blocks: [block('submit-login', ['LoginPage'], ['Inventory', 'LoginPage'])],
      flows: [flow('signIn', ['submit-login']), flow('blocked', ['submit-login'])],
    } as Manifest
    const byPage = pageFlows(
      manifest,
      new Map([
        ['signIn', run('a', true, ['Inventory'])],
        ['blocked', run('b', true, ['LoginPage'])],
      ])
    )
    const reach = (page: string, name: string) => byPage[page]?.find((f) => f.name === name)?.reach
    assert.equal(reach('Inventory', 'signIn'), 'lands')
    assert.equal(reach('LoginPage', 'signIn'), 'acts')
    assert.isUndefined(reach('Inventory', 'blocked'))
    assert.equal(reach('LoginPage', 'blocked'), 'lands')
  })

  test('a page a flow only acts on is not one it lands on', ({ assert }) => {
    const manifest = {
      checkpoints: PAGES,
      blocks: [block('submit-login', ['LoginPage'], ['Inventory'])],
      flows: [flow('signIn', ['submit-login'])],
    } as Manifest
    assert.equal(pageFlows(manifest, new Map()).LoginPage[0].reach, 'acts')
  })
})
