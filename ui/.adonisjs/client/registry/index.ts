/* eslint-disable prettier/prettier */
import type { AdonisEndpoint } from '@tuyau/core/types'
import type { Registry } from './schema.d.ts'
import type { ApiDefinition } from './tree.d.ts'

export type { Route, Path } from './schema.d.ts'

const placeholder: any = {}

const routes = {
  'map': {
    methods: ["GET","HEAD"],
    pattern: '/',
    tokens: [[0,"/"]],
    types: placeholder as Registry['map']['types'],
  },
  'flows.index': {
    methods: ["GET","HEAD"],
    pattern: '/flows',
    tokens: [[0,"flows"]],
    types: placeholder as Registry['flows.index']['types'],
  },
  'flows.show': {
    methods: ["GET","HEAD"],
    pattern: '/flows/:name',
    tokens: [[0,"flows"],[1,"name"]],
    types: placeholder as Registry['flows.show']['types'],
  },
  'runs.index': {
    methods: ["GET","HEAD"],
    pattern: '/runs',
    tokens: [[0,"runs"]],
    types: placeholder as Registry['runs.index']['types'],
  },
  'runs.show': {
    methods: ["GET","HEAD"],
    pattern: '/runs/:id',
    tokens: [[0,"runs"],[1,"id"]],
    types: placeholder as Registry['runs.show']['types'],
  },
  'screenshots.page': {
    methods: ["GET","HEAD"],
    pattern: '/screenshots/pages/:checkpoint',
    tokens: [[0,"screenshots"],[0,"pages"],[1,"checkpoint"]],
    types: placeholder as Registry['screenshots.page']['types'],
  },
  'screenshots.step': {
    methods: ["GET","HEAD"],
    pattern: '/screenshots/runs/:id/:file',
    tokens: [[0,"screenshots"],[0,"runs"],[1,"id"],[1,"file"]],
    types: placeholder as Registry['screenshots.step']['types'],
  },
  'plays.store': {
    methods: ["POST"],
    pattern: '/plays',
    tokens: [[0,"plays"]],
    types: placeholder as Registry['plays.store']['types'],
  },
  'plays.destroy': {
    methods: ["DELETE"],
    pattern: '/plays',
    tokens: [[0,"plays"]],
    types: placeholder as Registry['plays.destroy']['types'],
  },
  'playwright.show': {
    methods: ["GET","HEAD"],
    pattern: '/playwright',
    tokens: [[0,"playwright"]],
    types: placeholder as Registry['playwright.show']['types'],
  },
  'playwright.store': {
    methods: ["POST"],
    pattern: '/playwright',
    tokens: [[0,"playwright"]],
    types: placeholder as Registry['playwright.store']['types'],
  },
  'playwright.destroy': {
    methods: ["DELETE"],
    pattern: '/playwright',
    tokens: [[0,"playwright"]],
    types: placeholder as Registry['playwright.destroy']['types'],
  },
  'settings': {
    methods: ["GET","HEAD"],
    pattern: '/settings',
    tokens: [[0,"settings"]],
    types: placeholder as Registry['settings']['types'],
  },
} as const satisfies Record<string, AdonisEndpoint>

export { routes }

export const registry = {
  routes,
  $tree: {} as ApiDefinition,
}

declare module '@tuyau/core/types' {
  export interface UserRegistry {
    routes: typeof routes
    $tree: ApiDefinition
  }
}
