import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'map': { paramsTuple?: []; params?: {} }
    'flows.index': { paramsTuple?: []; params?: {} }
    'flows.show': { paramsTuple: [ParamValue]; params: {'name': ParamValue} }
    'runs.index': { paramsTuple?: []; params?: {} }
    'runs.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'plays.store': { paramsTuple?: []; params?: {} }
    'plays.destroy': { paramsTuple?: []; params?: {} }
    'new_account.create': { paramsTuple?: []; params?: {} }
    'new_account.store': { paramsTuple?: []; params?: {} }
    'session.create': { paramsTuple?: []; params?: {} }
    'session.store': { paramsTuple?: []; params?: {} }
    'session.destroy': { paramsTuple?: []; params?: {} }
  }
  GET: {
    'map': { paramsTuple?: []; params?: {} }
    'flows.index': { paramsTuple?: []; params?: {} }
    'flows.show': { paramsTuple: [ParamValue]; params: {'name': ParamValue} }
    'runs.index': { paramsTuple?: []; params?: {} }
    'runs.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'new_account.create': { paramsTuple?: []; params?: {} }
    'session.create': { paramsTuple?: []; params?: {} }
  }
  HEAD: {
    'map': { paramsTuple?: []; params?: {} }
    'flows.index': { paramsTuple?: []; params?: {} }
    'flows.show': { paramsTuple: [ParamValue]; params: {'name': ParamValue} }
    'runs.index': { paramsTuple?: []; params?: {} }
    'runs.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'new_account.create': { paramsTuple?: []; params?: {} }
    'session.create': { paramsTuple?: []; params?: {} }
  }
  POST: {
    'plays.store': { paramsTuple?: []; params?: {} }
    'new_account.store': { paramsTuple?: []; params?: {} }
    'session.store': { paramsTuple?: []; params?: {} }
    'session.destroy': { paramsTuple?: []; params?: {} }
  }
  DELETE: {
    'plays.destroy': { paramsTuple?: []; params?: {} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}