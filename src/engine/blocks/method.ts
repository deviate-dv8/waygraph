// Split out of the former 2,900-line engine.ts (see src/ARCHITECTURE.md). Behavior unchanged.
import { checkpoint } from "../../types.js";
import type { Checkpoint, DefinedBlock } from "../../types.js";
import type { Trait } from "../../trait.js";
import { defineBlock } from "../core.js";
import type { MemKey } from "../../mem-page.js";
import type { Page } from "@playwright/test";

/**
 * TypeScript salt over {@link defineBlock} for one-shot non-nav app steps
 * (submit, upload, finish, logout) - **methods** on a page. Same runtime Block;
 * marks `__waygraphSalt = "method"` so auto/docs can tell Method from bare
 * {@link defineBlock}. Does not force `instanceOptions` - use
 * {@link defineEffectBlock} when the auto menu should spawn one row per live
 * DOM instance. Prefer hanging methods off a {@link definePageBlock} hub.
 */
export type MethodBlock<
  In extends Checkpoint<string>,
  Out extends Checkpoint<string>,
> = Omit<
  DefinedBlock<In, Out>,
  "withVerify" | "modVerify" | "modVerifyAll" | "stubBefore" | "stubAfter" | "stubOnError"
> & {
  readonly __wgFactory?: "method";
  withVerify(
    verify: Trait[] | ((out: Out) => Trait[]),
  ): MethodBlock<In, Out>;
  modVerify(
    nameOrIndex: string | number,
    newCheck: Trait["check"] | Trait,
  ): MethodBlock<In, Out>;
  modVerifyAll(patches: Record<string, Trait["check"] | Trait>): MethodBlock<In, Out>;
  stubBefore(stub: import("../../highlights.js").HighlightStubPhase): MethodBlock<In, Out>;
  stubBefore(stub: import("../../highlights.js").StubLifecycleFn<Out>): MethodBlock<In, Out>;
  stubBefore(
    stub: (out: Out) => import("../../highlights.js").HighlightStubPhase,
  ): MethodBlock<In, Out>;
  stubAfter(stub: import("../../highlights.js").HighlightStubPhase): MethodBlock<In, Out>;
  stubAfter(stub: import("../../highlights.js").StubLifecycleFn<Out>): MethodBlock<In, Out>;
  stubAfter(
    stub: (out: Out) => import("../../highlights.js").HighlightStubPhase,
  ): MethodBlock<In, Out>;
  stubOnError(stub: import("../../highlights.js").HighlightStubPhase): MethodBlock<In, Out>;
  stubOnError(stub: import("../../highlights.js").StubLifecycleFn<Out>): MethodBlock<In, Out>;
  stubOnError(
    stub: (out: Out) => import("../../highlights.js").HighlightStubPhase,
  ): MethodBlock<In, Out>;
};


/** @deprecated Prefer {@link MethodBlock} - same type; Action was the 0.7 name. */
export type ActionBlock<
  In extends Checkpoint<string>,
  Out extends Checkpoint<string>,
> = MethodBlock<In, Out>;


export function defineMethodBlock<
  In extends Checkpoint<string>,
  Out extends Checkpoint<string>,
>(base: Parameters<typeof defineBlock<In, Out>>[0]): MethodBlock<In, Out> {
  const built = defineBlock(base) as MethodBlock<In, Out>;
  Object.defineProperty(built, "__waygraphSalt", {
    value: "method",
    enumerable: false,
    configurable: false,
  });
  return built;
}


/** @deprecated Prefer {@link defineMethodBlock} - identical helper (0.7 name). */
export const defineActionBlock = defineMethodBlock;


export interface AssertBlockOptions<Out extends Checkpoint<string> = Checkpoint<string>> {
  name: string;
  description?: string;
  /** Self-loop target - the Checkpoint this assertion runs on and returns to. */
  checkpoint: Out["__state"];
  /**
   * Shorthand for the wait-then-assert shape found repeatedly in hand-written
   * assertion Blocks: waits for a heading with this accessible name before
   * `verify` runs. Omit for a pure "assert whatever is already on the page"
   * check with no wait. Not a general `act()` override - a Block that needs
   * more than this stays a plain `defineMethodBlock`.
   */
  waitForHeading?: string;
  verify: Trait[] | ((out: Out) => Trait[]);
  /** Mem keys this assertion's `verify` reads (e.g. a mem-aware Trait) - checked by preflight before the flow runs. */
  requires?: readonly MemKey<any>[];
  stubBefore?: import("../../highlights.js").HighlightStubPhaseOrFn<Out>;
  stubAfter?: import("../../highlights.js").HighlightStubPhaseOrFn<Out>;
  stubOnError?: import("../../highlights.js").HighlightStubPhaseOrFn<Out>;
  /** Multi-step yap slides (demo only) - same field `Instruction.slides` exposes elsewhere. */
  slides?: import("../../highlights.js").WaygraphSlidesOrFn<Out>;
}


/**
 * Sugar for a self-loop-only "pure assertion" Block: no hand-written
 * `act`/`resolve`, just a name, a `checkpoint` tag, and a `verify` array.
 * `resolve` is generated from the one `checkpoint` field given, closing the
 * copy/rename footgun where a hand-restated checkpoint string can silently
 * drift wrong across a copy/pasted file. Mirrors `definePageBlock`'s own
 * construction pattern (flat options in, `defineBlock` built internally).
 * See openspec/changes/waygraph-agent-skill-hardening/spec.md.
 * @example
 * defineAssertBlock({
 *   name: "assert-raw-materials-table",
 *   checkpoint: "RawMaterials",
 *   waitForHeading: "Raw Materials & Lead Times",
 *   verify: [Trait.visible(RawMaterialsSel.reorderBadge)],
 * });
 */
export function defineAssertBlock<Out extends Checkpoint<string> = Checkpoint<string>>(
  options: AssertBlockOptions<Out>,
): AssertBlock<Out> {
  const built = defineMethodBlock<Out, Out>({
    name: options.name,
    ...(options.description ? { description: options.description } : {}),
    ...(options.requires ? { requires: options.requires } : {}),
    instruction: {
      async act(page) {
        if (options.waitForHeading !== undefined) {
          await (page as unknown as Page).getByRole("heading", { name: options.waitForHeading }).waitFor();
        }
      },
      resolve: () => checkpoint(options.checkpoint) as Out,
      verify: options.verify,
      ...(options.stubBefore ? { stubBefore: options.stubBefore } : {}),
      ...(options.stubAfter ? { stubAfter: options.stubAfter } : {}),
      ...(options.stubOnError ? { stubOnError: options.stubOnError } : {}),
      ...(options.slides ? { slides: options.slides } : {}),
    },
  });
  // Real bug this closes: `waygraph graph`'s static discovery only knows
  // how to read a Block's Checkpoint tags from an EXPLICIT `<In, Out>`
  // generic written in the source text (or, for Nav/Page Blocks, by calling
  // their own input-independent `resolve()` directly). `defineAssertBlock`'s
  // whole point is skipping that generic - called exactly as documented
  // (`defineAssertBlock({ name, checkpoint, verify })`, no generics), it was
  // silently invisible to both `waygraph graph` and the live Pilot menu
  // ("2 Block(s) skipped (Out not resolvable)", confirmed live against a
  // real veciro-waygraph session). `resolve()` here is ALSO input-
  // independent (always `checkpoint(options.checkpoint)`), so the same
  // resolve()-calling path Nav/Page Blocks already use is reused via this
  // marker instead of requiring authors to write generics just to be found.
  Object.defineProperty(built, "__waygraphKind", {
    value: "assert",
    enumerable: false,
    configurable: false,
  });
  // Brand for map().assert() - distinct from MethodBlock so .method(assert)
  // is a compile error even though runtime still carries method salt.
  return built as unknown as AssertBlock<Out>;
}


/**
 * Self-loop verify Block from {@link defineAssertBlock}. Branded for
 * {@link MapBuilder.assert} (not accepted by `.method()`).
 */
export type AssertBlock<Out extends Checkpoint<string>> = Omit<
  DefinedBlock<Out, Out>,
  "withVerify" | "modVerify" | "modVerifyAll" | "stubBefore" | "stubAfter" | "stubOnError"
> & {
  readonly __wgFactory?: "assert";
  withVerify(
    verify: Trait[] | ((out: Out) => Trait[]),
  ): AssertBlock<Out>;
  modVerify(
    nameOrIndex: string | number,
    newCheck: Trait["check"] | Trait,
  ): AssertBlock<Out>;
  modVerifyAll(patches: Record<string, Trait["check"] | Trait>): AssertBlock<Out>;
  stubBefore(stub: import("../../highlights.js").HighlightStubPhase): AssertBlock<Out>;
  stubBefore(stub: import("../../highlights.js").StubLifecycleFn<Out>): AssertBlock<Out>;
  stubBefore(
    stub: (out: Out) => import("../../highlights.js").HighlightStubPhase,
  ): AssertBlock<Out>;
  stubAfter(stub: import("../../highlights.js").HighlightStubPhase): AssertBlock<Out>;
  stubAfter(stub: import("../../highlights.js").StubLifecycleFn<Out>): AssertBlock<Out>;
  stubAfter(
    stub: (out: Out) => import("../../highlights.js").HighlightStubPhase,
  ): AssertBlock<Out>;
  stubOnError(stub: import("../../highlights.js").HighlightStubPhase): AssertBlock<Out>;
  stubOnError(stub: import("../../highlights.js").StubLifecycleFn<Out>): AssertBlock<Out>;
  stubOnError(
    stub: (out: Out) => import("../../highlights.js").HighlightStubPhase,
  ): AssertBlock<Out>;
};
