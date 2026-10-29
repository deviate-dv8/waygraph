// node:timers/promises for Storybook: the overlay's Node side waits with it (a story's import chain reaches it); in the
// browser it is the timer it wraps.
export const setTimeout = <T = void>(ms?: number, value?: T): Promise<T> =>
  new Promise((resolve) => globalThis.setTimeout(() => resolve(value as T), ms));
