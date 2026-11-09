import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'map': { paramsTuple?: []; params?: {} }
    'flows.index': { paramsTuple?: []; params?: {} }
    'flows.show': { paramsTuple: [ParamValue]; params: {'name': ParamValue} }
    'runs.index': { paramsTuple?: []; params?: {} }
    'runs.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'screenshots.page': { paramsTuple: [ParamValue]; params: {'checkpoint': ParamValue} }
    'screenshots.step': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'file': ParamValue} }
    'plays.store': { paramsTuple?: []; params?: {} }
    'plays.destroy': { paramsTuple?: []; params?: {} }
  }
  GET: {
    'map': { paramsTuple?: []; params?: {} }
    'flows.index': { paramsTuple?: []; params?: {} }
    'flows.show': { paramsTuple: [ParamValue]; params: {'name': ParamValue} }
    'runs.index': { paramsTuple?: []; params?: {} }
    'runs.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'screenshots.page': { paramsTuple: [ParamValue]; params: {'checkpoint': ParamValue} }
    'screenshots.step': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'file': ParamValue} }
  }
  HEAD: {
    'map': { paramsTuple?: []; params?: {} }
    'flows.index': { paramsTuple?: []; params?: {} }
    'flows.show': { paramsTuple: [ParamValue]; params: {'name': ParamValue} }
    'runs.index': { paramsTuple?: []; params?: {} }
    'runs.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'screenshots.page': { paramsTuple: [ParamValue]; params: {'checkpoint': ParamValue} }
    'screenshots.step': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'file': ParamValue} }
  }
  POST: {
    'plays.store': { paramsTuple?: []; params?: {} }
  }
  DELETE: {
    'plays.destroy': { paramsTuple?: []; params?: {} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}