// `.on(Page, (p) => p.typeSearch("x").submit())`: several Methods of one page as one call, each still its own step of the
// flow (own name in the run log, its own expect, stub and settle). The chain only lists the page's Methods that stay on the
// page, so autocomplete offers what can come next here; a Method that lands elsewhere is a `.method(...)` after it.
import type { SomeBlock } from "../block/some-block.js";
import type { MethodBlock } from "../block/kinds/method.js";
import type { Checkpoint } from "../checkpoint/checkpoint.js";
import type { StubLifecycleFn } from "../stub/stub.js";
import type { MapStepOpts } from "./map-steps.js";

/** What a step of the chain can say for itself: the step options of `.method`, bar what only a page-leaving step needs. */
export type OnStepOpts<Out extends Checkpoint<string>> = Omit<MapStepOpts<Out>, "lands">;

/** One more step, or a word about the one just written. */
export type OnChain<Out extends Checkpoint<string>, D> = OnMethods<Out, D> & {
  /** Step options for the Method just written: `.with({ settle: true, expect: [...] })`. */
  with(opts: OnStepOpts<Out>): OnChain<Out, D>;
  /** Narration before the Method just written (a stub on that step, `Block.stubBefore(...)`). */
  stubBefore(stub: StubLifecycleFn<Out>): OnChain<Out, D>;
  /** Narration after it lands: what happened, a ring on the result (`Block.stub(...)`). */
  stub(stub: StubLifecycleFn<Out>): OnChain<Out, D>;
  /** Narration when it fails. */
  stubOnError(stub: StubLifecycleFn<Out>): OnChain<Out, D>;
};

/** The page's Methods that start and end on it: a Block is called with no args, a Method with params with them. */
export type OnMethods<Out extends Checkpoint<string>, D> = {
  readonly [K in keyof D as D[K] extends MethodBlock<Out, Out> | ((...args: never[]) => MethodBlock<Out, Out>) ? K : never]: D[K] extends (...args: infer A) => unknown ? (...args: A) => OnChain<Out, D> : () => OnChain<Out, D>;
};

/** A Block has an instruction; a Method with params is a function that makes one. */
const isBlock = (entry: unknown): entry is SomeBlock => typeof entry === "object" && entry !== null && "instruction" in entry;

/** One written step: its Block and what the chain said about it. */
export interface OnStep {
  block: SomeBlock;
  opts: Record<string, unknown>;
}

/** Runs `steps` with a chain that records each call as a step; returns them in the order written. */
export function recordOn(page: { readonly do: object }, steps: (chain: never) => unknown): OnStep[] {
  const out: OnStep[] = [];
  const last = (): OnStep => {
    const step = out.at(-1);
    if (!step) throw new Error("waygraph: .with() and the stub calls say something about the Method before them: write a Method first");
    return step;
  };
  const doRecord = page.do as Record<string, unknown>;
  const chain: unknown = new Proxy({}, {
    get(_target, prop) {
      if (typeof prop !== "string" || prop === "then") return undefined;
      if (prop === "with") return (opts: Record<string, unknown>) => ((last().opts = { ...last().opts, ...opts }), chain);
      if (prop === "stubBefore" || prop === "stub" || prop === "stubOnError") {
        return (stub: never) => {
          const step = last();
          const decorate = (step.block as unknown as Record<string, (s: never) => SomeBlock>)[prop];
          if (decorate) step.block = decorate.call(step.block, stub);
          return chain;
        };
      }
      const entry = doRecord[prop];
      if (entry === undefined) throw new Error(`waygraph: this page has no Method "${prop}" (it has ${Object.keys(doRecord).join(", ") || "none"})`);
      return (...args: unknown[]) => {
        const block = isBlock(entry) ? entry : (entry as (...a: unknown[]) => SomeBlock)(...args);
        out.push({ block, opts: {} });
        return chain;
      };
    },
  });
  steps(chain as never);
  return out;
}
