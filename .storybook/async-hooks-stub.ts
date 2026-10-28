// node:async_hooks for Storybook: the engine keeps each run's scope in an AsyncLocalStorage (engine/run/events.ts), which
// a story's import chain reaches but never uses. A story runs no flow, so a store that holds nothing is enough.
export class AsyncLocalStorage<T> {
  getStore(): T | undefined {
    return undefined;
  }
  run<R>(_store: T, fn: () => R): R {
    return fn();
  }
}
