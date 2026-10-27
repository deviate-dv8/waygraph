/**
 * memStub: a registry of caller-supplied FAKE VALUES for required MemKeys, so
 * a Flow can run/demo without hand-seeding every credential/name/email every
 * time. Bring your own generator (Faker.js or anything else) - waygraph takes
 * no dependency on one, it only stores and invokes an opaque `() => T`.
 *
 * "Stub" here is unrelated to the other two meanings already in this
 * codebase: `stubBefore`/`stubAfter`/`stubOnError` (demo narration fixtures,
 * see demo/narration/index.ts's `runStubPhase`) and `upload`'s `stub: "image"|"pdf"|
 * "video"` (a placeholder file). This is a third, separate "stub."
 *
 * Opt-in only, per Flow (`map({ memStub: true })`) or per-run (`--mem-stub` /
 * WAYGRAPH_MEM_STUB=1) - a required key with no registered generator still
 * fails preflight exactly as before. Registered per MemKey *instance*
 * (identity, not `.name`), matching MemPage's own store - two keys sharing a
 * debug name must never cross-contaminate here either.
 */
import type { MemKey } from "./mem.js";
import type { MemPage } from "./mem.js";
import type { Flow } from "../flow/flow.js";
import type { Checkpoint } from "../checkpoint/checkpoint.js";

/** What a mem stub is given. */
export interface MemStubContext {
  /**
   * A token for test data that must not collide: different every run, the same for every stub within one run (so an
   * email and a username made from it match), and different across parallel workers.
   * @example registerMemStub(Signup.email, ({ unique }) => `qa+${unique}@example.com`)
   */
  unique: string;
}

/**
 * The registered stubs. On globalThis: a project registers through the waygraph it imports, which can be another copy
 * of this module than the one the CLI reads with (src and dist, two installs).
 */
const registry: Map<MemKey<unknown>, (ctx: MemStubContext) => unknown> = ((globalThis as { [k: symbol]: Map<MemKey<unknown>, (ctx: MemStubContext) => unknown> | undefined })[
  Symbol.for("waygraph.memStubs")
] ??= new Map());

let token: string | undefined;

/** This run's {@link MemStubContext.unique}: time, randomness and the Playwright worker index, made once per process. */
function uniqueToken(): string {
  token ??=
    Date.now().toString(36).slice(-6) +
    Math.random().toString(36).slice(2, 6) +
    (process.env["TEST_WORKER_INDEX"] ? `w${process.env["TEST_WORKER_INDEX"]}` : "");
  return token;
}

/**
 * Registers a fake-value generator for one required MemKey. It is called fresh each run; `unique` keeps data that
 * a run creates (a signup, an order) from colliding with an earlier run's or a parallel worker's.
 * @example registerMemStub(LoginCreds.key, () => ({ username: "standard_user", password: "secret_sauce" }));
 * @example registerMemStub(Signup.email, ({ unique }) => `qa+${unique}@example.com`);
 */
export function registerMemStub<T>(key: MemKey<T>, fake: (ctx: MemStubContext) => T): void {
  registry.set(key, fake);
}

/** Used by waygraph's own `--mem-stub`-aware CLI seeding and by {@link seedMemStub} - flow authors normally use {@link registerMemStub} and `map({ memStub: true })` instead. */
export function getMemStub<T>(key: MemKey<T>): (() => T) | undefined {
  const fake = registry.get(key) as ((ctx: MemStubContext) => T) | undefined;
  return fake && (() => fake({ unique: uniqueToken() }));
}

/**
 * Whether a key's stub gives the same value every run: called with two different `unique` tokens, it returned equal
 * values (`waygraph check` warns when a Block that creates something requires such a key). Undefined when no stub.
 */
export function memStubIsConstant(key: MemKey<unknown>): boolean | undefined {
  const fake = registry.get(key);
  if (!fake) return undefined;
  return JSON.stringify(fake({ unique: "check-a" })) === JSON.stringify(fake({ unique: "check-b" }));
}

/**
 * For a bare library `flow.run(mem, ...)` call outside the CLI (which has its
 * own `--mem-stub`-aware seeding) - call this yourself before `run()` when
 * `flow.memStub` is true, the same way external tooling already reads
 * `flow.resetSession`/`flow.title`/etc. (`run()` itself never reads Flow
 * flags; the settings come from `map({ ... })`).
 * @example
 * if (flow.memStub) seedMemStub(mem, flow);
 * await flow.run(mem, config);
 */
export function seedMemStub(mem: MemPage, flow: Flow<Checkpoint<string>>): void {
  for (const bi of flow.blocks()) {
    for (const k of bi.block.requires ?? []) {
      if (mem.has(k)) continue;
      const fake = getMemStub(k);
      if (fake) mem.set(k, fake());
    }
  }
}
