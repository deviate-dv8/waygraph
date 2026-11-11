import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'map': { paramsTuple?: []; params?: {} }
    'flows.index': { paramsTuple?: []; params?: {} }
    'flows.show': { paramsTuple: [ParamValue]; params: {'name': ParamValue} }
    'blocks.index': { paramsTuple?: []; params?: {} }
    'runs.index': { paramsTuple?: []; params?: {} }
    'runs.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'runs.artifact': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'index': ParamValue} }
    'sources.show': { paramsTuple?: []; params?: {} }
    'screenshots.page': { paramsTuple: [ParamValue]; params: {'checkpoint': ParamValue} }
    'screenshots.step': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'file': ParamValue} }
    'plays.store': { paramsTuple?: []; params?: {} }
    'plays.destroy': { paramsTuple?: []; params?: {} }
    'playwright.show': { paramsTuple?: []; params?: {} }
    'playwright.store': { paramsTuple?: []; params?: {} }
    'playwright.destroy': { paramsTuple?: []; params?: {} }
    'settings': { paramsTuple?: []; params?: {} }
    'project.show': { paramsTuple?: []; params?: {} }
    'project.commands.store': { paramsTuple?: []; params?: {} }
    'project.commands.destroy': { paramsTuple?: []; params?: {} }
  }
  GET: {
    'map': { paramsTuple?: []; params?: {} }
    'flows.index': { paramsTuple?: []; params?: {} }
    'flows.show': { paramsTuple: [ParamValue]; params: {'name': ParamValue} }
    'blocks.index': { paramsTuple?: []; params?: {} }
    'runs.index': { paramsTuple?: []; params?: {} }
    'runs.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'runs.artifact': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'index': ParamValue} }
    'sources.show': { paramsTuple?: []; params?: {} }
    'screenshots.page': { paramsTuple: [ParamValue]; params: {'checkpoint': ParamValue} }
    'screenshots.step': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'file': ParamValue} }
    'playwright.show': { paramsTuple?: []; params?: {} }
    'settings': { paramsTuple?: []; params?: {} }
    'project.show': { paramsTuple?: []; params?: {} }
  }
  HEAD: {
    'map': { paramsTuple?: []; params?: {} }
    'flows.index': { paramsTuple?: []; params?: {} }
    'flows.show': { paramsTuple: [ParamValue]; params: {'name': ParamValue} }
    'blocks.index': { paramsTuple?: []; params?: {} }
    'runs.index': { paramsTuple?: []; params?: {} }
    'runs.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'runs.artifact': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'index': ParamValue} }
    'sources.show': { paramsTuple?: []; params?: {} }
    'screenshots.page': { paramsTuple: [ParamValue]; params: {'checkpoint': ParamValue} }
    'screenshots.step': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'file': ParamValue} }
    'playwright.show': { paramsTuple?: []; params?: {} }
    'settings': { paramsTuple?: []; params?: {} }
    'project.show': { paramsTuple?: []; params?: {} }
  }
  POST: {
    'plays.store': { paramsTuple?: []; params?: {} }
    'playwright.store': { paramsTuple?: []; params?: {} }
    'project.commands.store': { paramsTuple?: []; params?: {} }
  }
  DELETE: {
    'plays.destroy': { paramsTuple?: []; params?: {} }
    'playwright.destroy': { paramsTuple?: []; params?: {} }
    'project.commands.destroy': { paramsTuple?: []; params?: {} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}