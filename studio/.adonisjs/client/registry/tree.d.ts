/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  map: typeof routes['map']
  flows: {
    index: typeof routes['flows.index']
    show: typeof routes['flows.show']
  }
  blocks: {
    index: typeof routes['blocks.index']
  }
  api: {
    index: typeof routes['api.index']
    send: typeof routes['api.send']
  }
  runs: {
    index: typeof routes['runs.index']
    show: typeof routes['runs.show']
    call: typeof routes['runs.call']
    artifact: typeof routes['runs.artifact']
  }
  sources: {
    show: typeof routes['sources.show']
  }
  screenshots: {
    page: typeof routes['screenshots.page']
    step: typeof routes['screenshots.step']
  }
  plays: {
    store: typeof routes['plays.store']
    destroy: typeof routes['plays.destroy']
  }
  playwright: {
    show: typeof routes['playwright.show']
    store: typeof routes['playwright.store']
    destroy: typeof routes['playwright.destroy']
  }
  settings: typeof routes['settings']
  project: {
    show: typeof routes['project.show']
    commands: {
      store: typeof routes['project.commands.store']
      destroy: typeof routes['project.commands.destroy']
    }
  }
}
