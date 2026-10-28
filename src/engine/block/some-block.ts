// Any Block, whatever its route: the type the runner, the graph and the tools hold. A Block<In, Out> is checked against
// its Checkpoints where it is written; here it is seen from the engine's side.
import type { Page } from "@playwright/test";
import type { Checkpoint } from "../checkpoint/checkpoint.js";
import type { MemKey, MemPage } from "../mem/mem.js";
import type { DemoPace } from "../stub/pace.js";
import type { StubCtx, StubLifecycleFn } from "../stub/stub.js";
import type { Trait } from "../trait/trait.js";
import type { WaygraphInstanceOption } from "./action-page.js";

/**
 * `(arg: T) => R`, checked the way TypeScript checks a method's parameter: a function of a narrower `T` is accepted.
 * Used only where the engine calls a Block's callback with a Checkpoint it has already matched to that Block (its
 * `precondition` with the Checkpoint the Block starts from, its `verify` and stubs with the one it resolved to), so the
 * erased {@link SomeBlock} can hold every Block.
 */
type Bivariant<T, R> = { call(arg: T): R }["call"];

/** A Block's `Instruction` as the engine sees it: any Checkpoint in, any Checkpoint out, what it observed unknown. */
export interface SomeInstruction {
  act(page: Page, input: Checkpoint<string>, mem: MemPage): Promise<void>;
  precondition?: Trait[] | Bivariant<Checkpoint<string>, Trait[]>;
  observe?(page: Page, mem: MemPage): Promise<unknown>;
  resolve(observed: unknown): Checkpoint<string> | Promise<Checkpoint<string>>;
  verify?: Trait[] | Bivariant<Checkpoint<string>, Trait[]>;
  stubBefore?: Bivariant<StubCtx<Checkpoint<string>>, void | Promise<void>>;
  stubAfter?: Bivariant<StubCtx<Checkpoint<string>>, void | Promise<void>>;
  stubOnError?: Bivariant<StubCtx<Checkpoint<string>>, void | Promise<void>>;
}

/**
 * Any Block, whatever its route: what the runner, the graph and the tools hold. Every `Block<In, Out>` is one; the
 * route each Block checks at compile time is checked again at run time (each step's `from` / `to`).
 */
export interface SomeBlock {
  name: string;
  description?: string;
  instruction: SomeInstruction;
  next?(checkpoint: Checkpoint<string>): SomeBlock | null | undefined;
  routes?: Readonly<Record<string, string | null>>;
  requires?: readonly MemKey<unknown>[];
  demoPace?: DemoPace;
  instanceOptions?(page: Page): Promise<readonly WaygraphInstanceOption[]>;
  withVerify?(verify: Trait[] | ((out: Checkpoint<string>) => Trait[])): SomeBlock;
  modVerify?(nameOrIndex: string | number, newCheck: Trait["check"] | Trait): SomeBlock;
  modVerifyAll?(patches: Record<string, Trait["check"] | Trait>): SomeBlock;
}
/**
 * Any Block that starts from `In`, wherever it ends: its `precondition` is still checked against `In`, so a route can't
 * hand a Block a Checkpoint it doesn't start from.
 */
export type BlockFrom<In extends Checkpoint<string>> = Omit<SomeBlock, "instruction"> & {
  instruction: Omit<SomeInstruction, "precondition"> & { precondition?: Trait[] | ((input: In) => Trait[]) };
};

/** Any `DefinedBlock` (see `SomeBlock`). */
export type SomeDefinedBlock = Omit<SomeBlock, "withVerify" | "modVerify" | "modVerifyAll"> & {
  withVerify(verify: Trait[] | ((out: Checkpoint<string>) => Trait[])): SomeDefinedBlock;
  modVerify(nameOrIndex: string | number, newCheck: Trait["check"] | Trait): SomeDefinedBlock;
  modVerifyAll(patches: Record<string, Trait["check"] | Trait>): SomeDefinedBlock;
  stubBefore(stub: StubLifecycleFn<Checkpoint<string>>): SomeDefinedBlock;
  stubAfter(stub: StubLifecycleFn<Checkpoint<string>>): SomeDefinedBlock;
  stubOnError(stub: StubLifecycleFn<Checkpoint<string>>): SomeDefinedBlock;
};
