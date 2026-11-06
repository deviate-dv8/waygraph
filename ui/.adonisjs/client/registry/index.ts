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
