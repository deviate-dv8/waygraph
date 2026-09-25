// Split out of the former 2,900-line engine.ts (see src/ARCHITECTURE.md). Behavior unchanged.
import type { ActionPage, Block, Checkpoint, DefinedBlock, Instruction } from "../types.js";
import { MemPage } from "../mem-page.js";
import type { Trait } from "../trait.js";

export function findBlockIndex(middle: readonly Block<any, any>[], block: Block<any, any> | string | number): number {
  if (typeof block === "number") {
    if (block < 0 || block >= middle.length) {
      throw new Error(`Flow: no Block at index ${block} in this flow (has ${middle.length})`);
    }
    return block;
  }
  const blockName = typeof block === "string" ? block : block.name;
  const index = middle.findIndex((b) => b.name === blockName);
  if (index === -1) {
    throw new Error(
      `Flow: no Block named "${blockName}" in this flow (has: ${middle.map((b) => b.name).join(", ")})`,
    );
  }
  return index;
}


/**
 * Attaches routing to `block` without touching its act/observe/resolve/verify -
 * `routes` must cover every tag of `block`'s output (a missing route is a compile
 * error), and the returned Block runs exactly as `block` always did, just followed
 * by whichever next Block the resolved tag routes to. `null` for a tag means that
 * tag is terminal - the run stops there, same as a Block with no routing at all.
 * A route pointing back at `block` itself is a self-loop; see `runGraph`'s
 * `maxSteps` for its safety net. The return type is deliberately `Block<In, any>` -
 * a route can lead anywhere, including back through itself, so there is no fixed
 * Out type to express; state the expected outcomes to `runGraph` via `terminals`
 * instead.
 */
export function branch<In extends Checkpoint<string>, Out extends Checkpoint<string>>(
  block: Block<In, Out>,
  routes: { [K in Out["__state"]]: Block<Extract<Out, Checkpoint<K>>, any> | null },
): DefinedBlock<In, any> {
  const base = stripMethods(block);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let routed!: DefinedBlock<In, any>;
  const routesAsData: Record<string, string | null> = {};
  for (const [tag, target] of Object.entries(routes as Record<string, Block<any, any> | null>)) {
    routesAsData[tag] = target === null ? null : target === block ? base.name : target.name;
  }
  routed = defineBlock({
    ...base,
    next: (checkpoint: Out) => {
      const target = (routes as Record<string, Block<any, any> | null>)[checkpoint.__state];
      if (target === undefined || target === null) return undefined;
      // A route naming `block` itself (the only self-reference in scope when
      // `routes` was written) means "loop back with routing intact" - substitute
      // the routed Block, not the original with no `next` of its own.
      return target === block ? routed : target;
    },
    routes: routesAsData,
  });
  // Without this, branch()'s output carried no __waygraphKind/__waygraphSalt at all (defineBlock
  // never stamps them - factories do, after defineBlock returns), so a branched Block could never
  // pass MapBuilder's assertMapKind/assertMapSalt checks. Real bug: branching was unusable from the
  // Waygraph Map, only from a raw runGraph() call.
  copyWaygraphRuntime(block, routed);
  return routed;
}


/**
 * Strips `withVerify`/`modVerify`/`modVerifyAll` off a Block, keeping everything
 * else - `name`, `instruction`, `next`, `requires`. Every function below that
 * returns a new Block calls this on its input first, then rebuilds through
 * `defineBlock`. Without it, a Block's attached methods close over the shape it
 * had *when they were attached* - call `.withVerify()` on a Block that
 * `branch()` added routing to afterward, and without this step the result would
 * silently drop that routing, since the stale closure never knew about it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stripMethods<In extends Checkpoint<string>, Out extends Checkpoint<string>>(
  block: Block<In, Out>,
): {
  name: string;
  description?: Block<In, Out>["description"];
  instruction: Block<In, Out>["instruction"];
  next?: Block<In, Out>["next"];
  requires?: Block<In, Out>["requires"];
  routes?: Block<In, Out>["routes"];
  instanceOptions?: Block<In, Out>["instanceOptions"];
} {
  return {
    name: block.name,
    instruction: block.instruction,
    ...(block.description ? { description: block.description } : {}),
    ...(block.next ? { next: block.next } : {}),
    ...(block.requires ? { requires: block.requires } : {}),
    ...(block.routes ? { routes: block.routes } : {}),
    ...(block.instanceOptions ? { instanceOptions: block.instanceOptions } : {}),
  };
}


/** Copy non-enumerable waygraph markers so decorate/withVerify keep map() kind checks. */
function copyWaygraphRuntime(from: object, to: object): void {
  for (const key of [
    "__waygraphKind",
    "__waygraphSalt",
    "__waygraphNavUrl",
    "__waygraphNavClick",
  ] as const) {
    const desc = Object.getOwnPropertyDescriptor(from, key);
    if (!desc) continue;
    // Re-define as configurable so later decorate chains can copy again
    // (factory markers are non-configurable on the original).
    Object.defineProperty(to, key, {
      value: desc.value,
      enumerable: false,
      writable: false,
      configurable: true,
    });
  }
  const ff = (from as { fastForward?: boolean }).fastForward;
  if (ff === true) {
    (to as { fastForward?: boolean }).fastForward = true;
  }
  const pace = (from as { demoPace?: unknown }).demoPace;
  if (pace !== undefined) {
    (to as { demoPace?: unknown }).demoPace = pace;
  }
}


/**
 * Builds a Block with `withVerify`/`modVerify`/`modVerifyAll` attached as
 * methods - `LoginBlock.withVerify([...])`, discoverable by typing
 * `LoginBlock.` in an editor, not just callable as `withVerify(LoginBlock, ...)`
 * if you already know it exists. A raw object literal is still a perfectly
 * valid Block (every test fixture in this codebase is one) - it just won't have
 * these attached. The methods are thin: they delegate to the identically-named
 * free functions, which remain the one place this logic actually lives.
 */
export function defineBlock<In extends Checkpoint<string>, Out extends Checkpoint<string>>(base: {
  name: string;
  description?: Block<In, Out>["description"];
  // Narrower than Instruction<In,Out,any>'s own act() - page is typed as
  // ActionPage here (the @deprecated-tagged navigation methods), not the
  // real Page. A real Page is still what's passed at runtime (Page is
  // assignable to ActionPage - same members, only the JSDoc tag differs -
  // so this satisfies Instruction.act's own wider signature structurally);
  // this only affects what an AUTHOR sees while writing act() by hand.
  instruction: Omit<Instruction<In, Out, any>, "act"> & {
    act(page: ActionPage, input: In, mem: MemPage): Promise<void>;
  };
  next?: Block<In, Out>["next"];
  requires?: Block<In, Out>["requires"];
  routes?: Block<In, Out>["routes"];
  instanceOptions?: Block<In, Out>["instanceOptions"];
}): DefinedBlock<In, Out> {
  const plain: Block<In, Out> = {
    name: base.name,
    instruction: base.instruction,
    ...(base.description ? { description: base.description } : {}),
    ...(base.next ? { next: base.next } : {}),
    ...(base.requires ? { requires: base.requires } : {}),
    ...(base.routes ? { routes: base.routes } : {}),
    ...(base.instanceOptions ? { instanceOptions: base.instanceOptions } : {}),
  };
  // Methods must close over `defined` (this object), not `plain` - factories
  // attach __waygraphKind/__waygraphSalt on the returned object after
  // defineBlock returns; decorate/withVerify need those markers.
  const defined: DefinedBlock<In, Out> = {
    ...plain,
    withVerify: (verify) => withVerify(defined, verify),
    modVerify: (nameOrIndex, newCheck) => modVerify(defined, nameOrIndex, newCheck),
    modVerifyAll: (patches) => modVerifyAll(defined, patches),
    stubBefore: (stub) => withStubBefore(defined, stub),
    stubAfter: (stub) => withStubAfter(defined, stub),
    stubOnError: (stub) => withStubOnError(defined, stub),
  };
  return defined;
}


/**
 * Returns a new Block that runs exactly like `block` - same act/observe/resolve,
 * same routing - but with `verify` replaced. For giving one flow stricter (or
 * looser, or just different) confirmation on a Block it didn't author, without
 * that Block needing to have been written as a parameterized factory in
 * anticipation. Same move as `branch()`: decorate an existing Block, don't ask
 * every Block to pre-build its own override mechanism.
 *
 * Wrap the one Block you want to change, in place, wherever it already sits in
 * a `defineFlow([...])` array - every other Block stays untouched:
 * `defineFlow([start, LoginBlock, withVerify(AddToCartBlock, [...]), end])`.
 * There is no separate positional array to keep in sync and no `null`
 * placeholder for "skip this one" - `defineFlow` has no per-slot verify
 * argument at all, only whatever `verify` each Block's own `instruction` (or
 * a `withVerify(...)` wrapping it) carries with it.
 */
export function withVerify<B extends Block<any, any>>(
  block: B,
  verify: Trait[] | ((out: any) => Trait[]),
): B {
  const base = stripMethods(block);
  const next = defineBlock({ ...base, instruction: { ...base.instruction, verify } });
  copyWaygraphRuntime(block, next);
  return next as unknown as B;
}


type StubPhaseFn<Out extends Checkpoint<string>> = import("../highlights.js").HighlightStubPhaseOrFn<Out>;


function isHighlightStubPhase(v: unknown): v is import("../highlights.js").HighlightStubPhase {
  return !!v && typeof v === "object" && !Array.isArray(v);
}


/** Run a prior stub (fn or slot map) into an open ctx so decorate can chain. */
async function applyStubIntoCtx<Out extends Checkpoint<string>>(
  raw: StubPhaseFn<Out> | undefined,
  ctx: import("../highlights.js").StubCtx<Out>,
): Promise<void> {
  if (raw === undefined) return;
  if (typeof raw === "function") {
    const ret = await (raw as import("../highlights.js").StubLifecycleFn<Out>)(ctx);
    if (isHighlightStubPhase(ret)) {
      for (const [id, stub] of Object.entries(ret)) {
        if (stub) ctx.ring(id, stub);
      }
    }
    return;
  }
  if (isHighlightStubPhase(raw)) {
    for (const [id, stub] of Object.entries(raw)) {
      if (stub) ctx.ring(id, stub);
    }
  }
}


function withStubPhase<In extends Checkpoint<string>, Out extends Checkpoint<string>>(
  block: Block<In, Out>,
  phase: "stubBefore" | "stubAfter" | "stubOnError",
  stub: StubPhaseFn<Out>,
): DefinedBlock<In, Out> {
  const base = stripMethods(block);
  const instr = base.instruction as {
    stubBefore?: StubPhaseFn<Out>;
    stubAfter?: StubPhaseFn<Out>;
    stubOnError?: StubPhaseFn<Out>;
  };
  const prev = instr[phase];
  const chained: import("../highlights.js").StubLifecycleFn<Out> = async (ctx) => {
    await applyStubIntoCtx(prev, ctx);
    await applyStubIntoCtx(stub, ctx);
  };
  const next = defineBlock({
    ...base,
    instruction: { ...base.instruction, [phase]: chained },
  });
  copyWaygraphRuntime(block, next);
  return next;
}


/**
 * Attach / chain a stubBefore lifecycle on a Block. Prefer
 * `(ctx) => { ctx.ring(...); const x = ctx.mem?.get(Key); }`.
 * @example FillUsernameBlock.stubBefore((ctx) => { ctx.ring("username", { ... }) })
 */
export function withStubBefore<B extends Block<any, any>>(
  block: B,
  stub: StubPhaseFn<any>,
): B {
  return withStubPhase(block, "stubBefore", stub) as unknown as B;
}


/** @see {@link withStubBefore} */
export function withStubAfter<B extends Block<any, any>>(
  block: B,
  stub: StubPhaseFn<any>,
): B {
  return withStubPhase(block, "stubAfter", stub) as unknown as B;
}


/** @see {@link withStubBefore} */
export function withStubOnError<B extends Block<any, any>>(
  block: B,
  stub: StubPhaseFn<any>,
): B {
  return withStubPhase(block, "stubOnError", stub) as unknown as B;
}


/**
 * Replaces one Trait inside `block`'s verify list, leaving every other check
 * untouched - the v1/v2/legacy-variant case, where one check needs a different
 * selector or URL pattern but the rest of the Block is identical. Addressed by
 * the Trait's own `name` (recommended - inserting or reordering other checks
 * can't silently retarget it) or, if you genuinely know the position and don't
 * need that safety, a numeric index. Either way a bad address fails loud
 * immediately instead of quietly doing nothing. `newCheck` can be a bare
 * `check` function (keeps the existing name) or a full `Trait` (to rename too).
 * Only works on a flat `verify` array - a function-form `verify` (from
 * `verify: (out) => Trait[]`) has no fixed list to address into, so this
 * throws rather than guess; use `withVerify` to replace it wholesale instead.
 */
export function modVerify<In extends Checkpoint<string>, Out extends Checkpoint<string>>(
  block: Block<In, Out>,
  nameOrIndex: string | number,
  newCheck: Trait["check"] | Trait,
): DefinedBlock<In, Out> {
  const verify = block.instruction.verify;
  if (typeof verify === "function") {
    throw new Error(
      `modVerify: "${block.name}" has a function-form verify, which has no fixed list to address into - use withVerify to replace it wholesale instead`,
    );
  }
  const traits = verify ?? [];
  const index = typeof nameOrIndex === "number" ? nameOrIndex : traits.findIndex((t) => t.name === nameOrIndex);
  const existing = traits[index];
  if (!existing) {
    throw new Error(
      typeof nameOrIndex === "number"
        ? `modVerify: "${block.name}" has no verify trait at index ${nameOrIndex} (has ${traits.length})`
        : `modVerify: "${block.name}" has no verify trait named "${nameOrIndex}" (has: ${
            traits.map((t) => t.name).join(", ") || "none"
          })`,
    );
  }
  const replacement: Trait =
    typeof newCheck === "function"
      ? { name: typeof nameOrIndex === "string" ? nameOrIndex : existing.name, check: newCheck }
      : newCheck;
  const updated = [...traits];
  updated[index] = replacement;
  return withVerify(block, updated) as DefinedBlock<In, Out>;
}


/**
 * `modVerify`, but for several named checks in one call - a v2 variant that
 * differs in five ways from v1 shouldn't need five nested `modVerify(modVerify(
 * modVerify(...)))` calls to track by eye. `patches` keys are plain strings (a
 * Trait's `name`, not a `MemKey` instance), so an ordinary object literal is
 * fine here - unlike `MemPage`, there's no identity-collision reason to need
 * `[name, check]` pairs. Applies each patch in turn via `modVerify`, so the
 * same fail-loud-on-unknown-name behavior holds for every entry.
 */
export function modVerifyAll<In extends Checkpoint<string>, Out extends Checkpoint<string>>(
  block: Block<In, Out>,
  patches: Record<string, Trait["check"] | Trait>,
): DefinedBlock<In, Out> {
  const seed = defineBlock(stripMethods(block));
  copyWaygraphRuntime(block, seed);
  return Object.entries(patches).reduce(
    (current, [name, newCheck]) => modVerify(current, name, newCheck),
    seed,
  );
}
