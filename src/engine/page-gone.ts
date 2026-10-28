// The failures a page call may ignore, and nothing else: the page went away (a navigation or a close), or a probe ran
// out of time. Any other error is real and goes through.

/** Playwright has no error class for a closed page or a destroyed document, only these messages. */
const GONE = /Target page, context or browser has been closed|Target closed|Browser has been closed|Execution context was destroyed|frame was detached|Frame has been detached|Session closed|Cannot find context with specified id|Failed to find context with id/i;

export function isPageGone(err: unknown): boolean {
  return err instanceof Error && GONE.test(err.message);
}

/** `.catch(ignorePageGone)`: the call is moot when the page went away; anything else is rethrown. */
export function ignorePageGone(err: unknown): undefined {
  if (isPageGone(err)) return undefined;
  throw err;
}

/** `.catch(ignoreTimeout)`: a probe that waited as long as it should (or whose page went away); anything else is rethrown. */
export function ignoreTimeout(err: unknown): undefined {
  // By name, not `instanceof errors.TimeoutError`: importing the class loads @playwright/test, and a CLI that loads it
  // can't then load a project whose own install brings a second copy (Playwright refuses two).
  if ((err instanceof Error && err.name === "TimeoutError") || isPageGone(err)) return undefined;
  throw err;
}
