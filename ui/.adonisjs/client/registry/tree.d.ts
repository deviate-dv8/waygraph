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
  runs: {
    index: typeof routes['runs.index']
    show: typeof routes['runs.show']
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
}
