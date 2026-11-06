/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  map: typeof routes['map']
  flows: {
    index: typeof routes['flows.index']
    show: typeof routes['flows.show']
  }
  runs: {
    index: typeof routes['runs.index']
    show: typeof routes['runs.show']
  }
  plays: {
    store: typeof routes['plays.store']
    destroy: typeof routes['plays.destroy']
  }
  newAccount: {
    create: typeof routes['new_account.create']
    store: typeof routes['new_account.store']
  }
  session: {
    create: typeof routes['session.create']
    store: typeof routes['session.store']
    destroy: typeof routes['session.destroy']
  }
}
