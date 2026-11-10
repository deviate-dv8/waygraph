import { test } from '@japa/runner'
import type { ManifestBlock, ManifestLayout } from '#types/project'
import {
  accountsNamed,
  layoutEdges,
  layoutId,
  layoutLinks,
  layoutsByPage,
  mapAccess,
  viewAs,
} from '#services/layouts'

const block = (name: string, kind: string, from: string[], to: string[], given?: string[]) =>
  ({
    id: name,
    name,
    exportName: name,
    kind,
    description: '',
    from,
    to,
    requires: [],
    expect: [],
    file: 'x.ts',
    ...(given ? { for: given } : {}),
  }) as ManifestBlock

const blocks = [
  block('sidebar-plan', 'nav', ['Plan', 'Equipment'], ['Plan']),
  block('sidebar-equipment', 'nav', ['Plan', 'Equipment'], ['Equipment'], ['manager']),
  block('sidebar-up', 'nav', ['Plan', 'Equipment'], ['Plan']),
  block('equipment-page', 'page', ['*'], ['Equipment'], ['manager']),
  block('add-machine', 'method', ['Equipment'], ['Equipment'], ['manager']),
  block('nav-plan', 'nav', ['*'], ['Plan']),
]
const layouts: ManifestLayout[] = [
  {
    name: 'sidebar',
    id: 'x.ts#Sidebar',
    file: 'x.ts',
    covers: ['Equipment', 'Plan'],
    links: [
      { name: 'plan', block: 'sidebar-plan', to: 'Plan' },
      { name: 'equipment', block: 'sidebar-equipment', to: 'Equipment', for: ['manager'] },
      { name: 'up', block: 'sidebar-up', to: 'parent' },
    ],
    actions: [],
  },
]

test.group('layouts on the map', () => {
  test('a layout is one node with a line to each page its links lead to', ({ assert }) => {
    assert.deepEqual(
      layoutEdges(layouts, blocks).map((e) => [e.source, e.target, e.blocks.map((b) => b.name)]),
      [
        [layoutId('sidebar'), 'Plan', ['sidebar-plan', 'sidebar-up']],
        [layoutId('sidebar'), 'Equipment', ['sidebar-equipment']],
      ]
    )
    assert.deepEqual([...layoutLinks(layouts)], ['sidebar-plan', 'sidebar-equipment', 'sidebar-up'])
    assert.deepEqual(layoutsByPage(layouts).get('Plan'), ['sidebar'])
  })

  test('the accounts named in for; one account sees only what it is given', ({ assert }) => {
    assert.deepEqual(accountsNamed(blocks, layouts), ['manager'])
    const everyone = viewAs(null, blocks, layouts)
    assert.equal(everyone.blocks.length, blocks.length)
    const planner = viewAs('planner', blocks, layouts)
    assert.deepEqual([...planner.closed], ['Equipment'])
    assert.deepEqual(
      planner.blocks.map((b) => b.name),
      ['sidebar-plan', 'sidebar-up', 'nav-plan']
    )
    assert.deepEqual(planner.blocks[0]!.from, ['Plan'])
    assert.equal(planner.leftOut, 3)
    assert.deepEqual(
      planner.layouts[0]!.links.map((l) => l.name),
      ['plan', 'up']
    )
    assert.deepEqual(planner.layouts[0]!.covers, ['Plan'])
  })

  test('the map page gets what one account sees; an account the project lacks sees everything', ({
    assert,
  }) => {
    const { blocks: seen, access } = mapAccess('planner', blocks, layouts, ['planner', 'manager'])
    assert.deepEqual(access.accounts, ['manager', 'planner'])
    assert.equal(access.account, 'planner')
    assert.deepEqual(access.closed, ['Equipment'])
    assert.deepEqual(access.pageGiven, { Equipment: ['manager'] })
    assert.deepEqual(access.layouts[0]!.node, layoutId('sidebar'))
    assert.deepEqual(access.pageLayouts, { Plan: ['sidebar'] })
    assert.equal(seen.length, 3)
    assert.isNull(mapAccess('nobody', blocks, layouts).access.account)
  })
})
