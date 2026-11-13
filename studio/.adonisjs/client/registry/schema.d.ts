/* eslint-disable prettier/prettier */
/// <reference path="../manifest.d.ts" />

import type { ExtractBody, ExtractErrorResponse, ExtractQuery, ExtractQueryForGet, ExtractRawResponse, ExtractResponse, Method, PathWithRegistry, PatternsByMethod, RouteWithRegistry } from '@tuyau/core/types'
import type { InferInput, SimpleError } from '@vinejs/vine/types'
import type { routes } from './index.ts'

export type ParamValue = string | number | bigint | boolean

export interface Registry {
  'map': {
    methods: ["GET","HEAD"]
    pattern: '/'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/workspaces_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/workspaces_controller').default['show']>>>
      rawResponse: ExtractRawResponse<Awaited<ReturnType<import('#controllers/workspaces_controller').default['show']>>>
    }
  }
  'flows.index': {
    methods: ["GET","HEAD"]
    pattern: '/flows'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/flows_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/flows_controller').default['index']>>>
      rawResponse: ExtractRawResponse<Awaited<ReturnType<import('#controllers/flows_controller').default['index']>>>
    }
  }
  'flows.show': {
    methods: ["GET","HEAD"]
    pattern: '/flows/:name'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { name: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/flows_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/flows_controller').default['show']>>>
      rawResponse: ExtractRawResponse<Awaited<ReturnType<import('#controllers/flows_controller').default['show']>>>
    }
  }
  'blocks.index': {
    methods: ["GET","HEAD"]
    pattern: '/blocks'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/blocks_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/blocks_controller').default['index']>>>
      rawResponse: ExtractRawResponse<Awaited<ReturnType<import('#controllers/blocks_controller').default['index']>>>
    }
  }
  'api.index': {
    methods: ["GET","HEAD"]
    pattern: '/api'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api_controller').default['index']>>>
      rawResponse: ExtractRawResponse<Awaited<ReturnType<import('#controllers/api_controller').default['index']>>>
    }
  }
  'api.send': {
    methods: ["POST"]
    pattern: '/api/send'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api_controller').default['send']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api_controller').default['send']>>>
      rawResponse: ExtractRawResponse<Awaited<ReturnType<import('#controllers/api_controller').default['send']>>>
    }
  }
  'runs.index': {
    methods: ["GET","HEAD"]
    pattern: '/runs'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/runs_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/runs_controller').default['index']>>>
      rawResponse: ExtractRawResponse<Awaited<ReturnType<import('#controllers/runs_controller').default['index']>>>
    }
  }
  'runs.show': {
    methods: ["GET","HEAD"]
    pattern: '/runs/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/runs_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/runs_controller').default['show']>>>
      rawResponse: ExtractRawResponse<Awaited<ReturnType<import('#controllers/runs_controller').default['show']>>>
    }
  }
  'runs.call': {
    methods: ["GET","HEAD"]
    pattern: '/runs/:id/calls/:file'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; file: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/runs_controller').default['call']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/runs_controller').default['call']>>>
      rawResponse: ExtractRawResponse<Awaited<ReturnType<import('#controllers/runs_controller').default['call']>>>
    }
  }
  'runs.artifact': {
    methods: ["GET","HEAD"]
    pattern: '/runs/:id/artifacts/:index'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; index: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/runs_controller').default['artifact']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/runs_controller').default['artifact']>>>
      rawResponse: ExtractRawResponse<Awaited<ReturnType<import('#controllers/runs_controller').default['artifact']>>>
    }
  }
  'sources.show': {
    methods: ["GET","HEAD"]
    pattern: '/source'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/sources_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/sources_controller').default['show']>>>
      rawResponse: ExtractRawResponse<Awaited<ReturnType<import('#controllers/sources_controller').default['show']>>>
    }
  }
  'screenshots.page': {
    methods: ["GET","HEAD"]
    pattern: '/screenshots/pages/:checkpoint'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { checkpoint: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/screenshots_controller').default['page']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/screenshots_controller').default['page']>>>
      rawResponse: ExtractRawResponse<Awaited<ReturnType<import('#controllers/screenshots_controller').default['page']>>>
    }
  }
  'screenshots.step': {
    methods: ["GET","HEAD"]
    pattern: '/screenshots/runs/:id/:file'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; file: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/screenshots_controller').default['step']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/screenshots_controller').default['step']>>>
      rawResponse: ExtractRawResponse<Awaited<ReturnType<import('#controllers/screenshots_controller').default['step']>>>
    }
  }
  'plays.store': {
    methods: ["POST"]
    pattern: '/plays'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/play').playValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/play').playValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/plays_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/plays_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
      rawResponse: ExtractRawResponse<Awaited<ReturnType<import('#controllers/plays_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'plays.destroy': {
    methods: ["DELETE"]
    pattern: '/plays'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/plays_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/plays_controller').default['destroy']>>>
      rawResponse: ExtractRawResponse<Awaited<ReturnType<import('#controllers/plays_controller').default['destroy']>>>
    }
  }
  'playwright.show': {
    methods: ["GET","HEAD"]
    pattern: '/playwright'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/playwright_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/playwright_controller').default['show']>>>
      rawResponse: ExtractRawResponse<Awaited<ReturnType<import('#controllers/playwright_controller').default['show']>>>
    }
  }
  'playwright.store': {
    methods: ["POST"]
    pattern: '/playwright'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/playwright').playwrightValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/playwright').playwrightValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/playwright_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/playwright_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
      rawResponse: ExtractRawResponse<Awaited<ReturnType<import('#controllers/playwright_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'playwright.destroy': {
    methods: ["DELETE"]
    pattern: '/playwright'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/playwright_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/playwright_controller').default['destroy']>>>
      rawResponse: ExtractRawResponse<Awaited<ReturnType<import('#controllers/playwright_controller').default['destroy']>>>
    }
  }
  'settings': {
    methods: ["GET","HEAD"]
    pattern: '/settings'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/settings_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/settings_controller').default['show']>>>
      rawResponse: ExtractRawResponse<Awaited<ReturnType<import('#controllers/settings_controller').default['show']>>>
    }
  }
  'project.show': {
    methods: ["GET","HEAD"]
    pattern: '/project'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/project_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/project_controller').default['show']>>>
      rawResponse: ExtractRawResponse<Awaited<ReturnType<import('#controllers/project_controller').default['show']>>>
    }
  }
  'project.commands.store': {
    methods: ["POST"]
    pattern: '/project/commands'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/command').commandValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/command').commandValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/project_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/project_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
      rawResponse: ExtractRawResponse<Awaited<ReturnType<import('#controllers/project_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'project.commands.destroy': {
    methods: ["DELETE"]
    pattern: '/project/commands'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/project_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/project_controller').default['destroy']>>>
      rawResponse: ExtractRawResponse<Awaited<ReturnType<import('#controllers/project_controller').default['destroy']>>>
    }
  }
}

export namespace Route {
  export type Request<Name extends keyof typeof routes> = RouteWithRegistry.Request<typeof routes, Name>
  export type Response<Name extends keyof typeof routes> = RouteWithRegistry.Response<typeof routes, Name>
  export type Params<Name extends keyof typeof routes> = RouteWithRegistry.Params<typeof routes, Name>
  export type Body<Name extends keyof typeof routes> = RouteWithRegistry.Body<typeof routes, Name>
  export type Query<Name extends keyof typeof routes> = RouteWithRegistry.Query<typeof routes, Name>
  export type Error<Name extends keyof typeof routes> = RouteWithRegistry.Error<typeof routes, Name>
}

export namespace Path {
  export type Request<M extends Method, P extends PatternsByMethod<typeof routes, M>> =
    PathWithRegistry.Request<typeof routes, M, P>
  export type Response<M extends Method, P extends PatternsByMethod<typeof routes, M>> =
    PathWithRegistry.Response<typeof routes, M, P>
  export type Params<M extends Method, P extends PatternsByMethod<typeof routes, M>> =
    PathWithRegistry.Params<typeof routes, M, P>
  export type Body<M extends Method, P extends PatternsByMethod<typeof routes, M>> =
    PathWithRegistry.Body<typeof routes, M, P>
  export type Query<M extends Method, P extends PatternsByMethod<typeof routes, M>> =
    PathWithRegistry.Query<typeof routes, M, P>
  export type Error<M extends Method, P extends PatternsByMethod<typeof routes, M>> =
    PathWithRegistry.Error<typeof routes, M, P>
}
