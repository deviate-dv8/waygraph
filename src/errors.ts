/**
 * Every error the engine throws, in one file, each with a stable code. When something breaks,
 * `grep WG_ the-error-you-saw` (or open this file and Ctrl-F the code) tells you exactly what
 * threw, why, and where to look - without re-explaining the engine to an AI every time.
 *
 * Convention: `WG_<AREA>_<WHAT>`. A code, once shipped, never changes meaning or gets reused for
 * something else - add a new one instead. Every thrown `WaygraphError` message starts with
 * `[CODE]`, so the code survives being copy-pasted out of a terminal/CI log on its own.
 */

export const WAYGRAPH_ERRORS = {
  WG_PREFLIGHT_MISSING_KEY: {
    where: "engine/run-graph.ts - preflight()",
    means: "A Flow/chain needs a MemKey that mem.set() never received before run() started.",
    fix: "Pass --data / a mem.set() call for that key, or registerMemStub + --mem-stub for a fake value.",
  },
  WG_RUNGRAPH_MAX_STEPS: {
    where: "engine/run-graph.ts - runGraph()",
    means: "A chain took more steps than maxSteps without reaching a Block with no .next() - almost always an unintended self-loop in branch()/next routing.",
    fix: "Check the Block(s) involved in the loop; raise maxSteps only if the loop is genuinely intended.",
  },
  WG_RUNGRAPH_NOT_TERMINAL: {
    where: "engine/run-graph.ts - runGraph()",
    means: "A Block with no .next() resolved to a Checkpoint that wasn't in the caller's declared `terminals` set.",
    fix: "Add that Checkpoint to `terminals`, or fix the Block's resolve() - it landed somewhere the caller didn't expect.",
  },
  WG_MAP_WRONG_KIND: {
    where: "engine/engine-class.ts - MapBuilder.gotoPage/gotoExternal/assert/method()",
    means: "A Block passed to a MapBuilder step method doesn't carry the __waygraphKind a real defineNavBlock/definePageBlock/defineAssertBlock/defineMethodBlock/defineEffectBlock stamps - either the wrong factory was used, or the object was hand-rolled instead of going through one.",
    fix: "Use the factory the error names, or move this Block to the matching .gotoPage()/.assert()/.method() call.",
  },
  WG_MAP_WRONG_SALT: {
    where: "engine/engine-class.ts - MapBuilder.method()",
    means: "A Block passed to .method() isn't a real Method/Effect Block (missing __waygraphSalt).",
    fix: "Build it with defineMethodBlock/defineEffectBlock, or use .assert() if it's actually a defineAssertBlock.",
  },
  WG_MAP_WRONG_ORIGIN: {
    where: "engine/engine-class.ts - MapBuilder.gotoPage/gotoExternal()",
    means: "A Block's static `url` origin doesn't match what .gotoPage() (same-origin) or .gotoExternal() (cross-origin) expects, given this map()'s homeOrigin.",
    fix: "Use .gotoExternal() for a genuinely different origin, .gotoPage() for the app's own homeOrigin, or fix the Block's url.",
  },
  WG_MAP_FF_ALREADY_OPEN: {
    where: "engine/engine-class.ts - MapBuilder.ffStart()",
    means: ".ffStart() was called while a previous .ffStart() window is still open.",
    fix: "Call .ffEnd() before opening another fast-forward window.",
  },
  WG_MAP_FF_EMPTY: {
    where: "engine/engine-class.ts - MapBuilder.ffEnd()",
    means: ".ffEnd() closed a window with zero steps inside it.",
    fix: "Add at least one .gotoPage()/.method()/.assert() inside the .ffStart()/.ffEnd() window.",
  },
  WG_MAP_FF_NOT_CLOSED: {
    where: "engine/engine-class.ts - MapBuilder.end()",
    means: ".end() was called while a .ffStart() window was still open.",
    fix: "Call .ffEnd() before .end().",
  },
  WG_MAP_FF_NOT_OPEN: {
    where: "engine/engine-class.ts - MapBuilder.ffEnd()",
    means: ".ffEnd() was called with no matching .ffStart().",
    fix: "Remove the stray .ffEnd(), or add the .ffStart() it's meant to close.",
  },
  WG_MAP_EMPTY: {
    where: "engine/engine-class.ts - MapBuilder.end()",
    means: ".end() was called with zero steps added.",
    fix: "Add at least one .gotoPage()/.gotoExternal()/.assert()/.method() before .end().",
  },
  WG_MAP_BRANCH_NO_PRIOR_STEP: {
    where: "engine/engine-class.ts - MapBuilder.branch()",
    means: ".branch() was called before any step existed to branch FROM.",
    fix: "Add a .gotoPage()/.gotoExternal()/.method()/.assert() before .branch().",
  },
  WG_MAP_BRANCH_SHARED_SESSION_UNSUPPORTED: {
    where: "engine/engine-class.ts - a .branch()-built Flow's run()",
    means: "run(mem, config) was called on a branched Flow - that convenience form always closes its own browser/page before the branch's tag is known, so the branch can never be reached.",
    fix: "Call run(context, mem[, options]) instead, keeping the same page across the branch.",
  },
  WG_BRANCH_REGRESSION_NO_BROWSER: {
    where: "engine/branch-regression.ts - runBranchRegression()",
    means: "cloneSession is on (the default) but context.browser() returned null - a persistent context has no Browser to clone a new context from.",
    fix: "Pass { cloneSession: false } to run the single live path in this context instead.",
  },
  WG_COMPOSE_EMPTY: {
    where: "engine/compose.ts - composeBlock()",
    means: "composeBlock() was called with zero steps.",
    fix: "Pass at least one Block.",
  },
  WG_FASTFORWARD_EMPTY: {
    where: "engine/compose.ts - fastForwardComposeBlock()",
    means: "A fast-forward window was closed with zero steps inside it.",
    fix: "Add at least one Block between ffStart()/ffEnd() (or the equivalent Map builder call).",
  },
  WG_FLOW_BLOCK_NOT_FOUND: {
    where: "engine/core.ts - findBlockIndex() (used by withBlockVerify/modBlockVerify/chainFlow)",
    means: "The Block name/index/reference given doesn't exist in this Flow (or chained Flows).",
    fix: "Check the name/index against flow.blocks() - it lists every Block this Flow actually has, tag-prefixed for branches.",
  },
  WG_CHAINFLOW_EMPTY: {
    where: "engine/flow.ts - chainFlow()",
    means: "chainFlow() was called with zero Flows.",
    fix: "Pass at least one Flow.",
  },
  WG_MODVERIFY_FUNCTION_FORM: {
    where: "engine/core.ts - modVerify()",
    means: "modVerify() was called on a Block whose verify is a function (tag-driven), which has no fixed list to address an item into.",
    fix: "Use withVerify() to replace the whole verify instead.",
  },
  WG_MODVERIFY_NOT_FOUND: {
    where: "engine/core.ts - modVerify()",
    means: "The Trait name/index given doesn't exist in this Block's verify list.",
    fix: "Check the Block's actual verify list for the right name/index.",
  },
  WG_MEM_READ_BEFORE_SET: {
    where: "mem-page.ts - MemPage.get()",
    means: "mem.get(key) was called for a key that was never mem.set() on this MemPage.",
    fix: "Set it first, or use mem.has(key) to check before an optional read.",
  },
} as const;

export type WaygraphErrorCode = keyof typeof WAYGRAPH_ERRORS;

/** A thrown engine error with a stable, greppable `.code` - see WAYGRAPH_ERRORS for the full list. */
export class WaygraphError extends Error {
  readonly code: WaygraphErrorCode;
  constructor(code: WaygraphErrorCode, message: string) {
    super(`[${code}] ${message}`);
    this.code = code;
    this.name = "WaygraphError";
  }
}
