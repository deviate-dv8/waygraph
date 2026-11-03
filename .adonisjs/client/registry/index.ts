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
  'new_account.create': {
    methods: ["GET","HEAD"],
    pattern: '/signup',
    tokens: [[0,"signup"]],
    types: placeholder as Registry['new_account.create']['types'],
  },
  'new_account.store': {
    methods: ["POST"],
    pattern: '/signup',
    tokens: [[0,"signup"]],
    types: placeholder as Registry['new_account.store']['types'],
  },
  'session.create': {
    methods: ["GET","HEAD"],
    pattern: '/login',
    tokens: [[0,"login"]],
    types: placeholder as Registry['session.create']['types'],
  },
  'session.store': {
    methods: ["POST"],
    pattern: '/login',
    tokens: [[0,"login"]],
    types: placeholder as Registry['session.store']['types'],
  },
  'session.destroy': {
    methods: ["POST"],
    pattern: '/logout',
    tokens: [[0,"logout"]],
    types: placeholder as Registry['session.destroy']['types'],
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
