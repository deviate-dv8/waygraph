/**
 * memStub: a registry of caller-supplied FAKE VALUES for required MemKeys, so
 * a Flow can run/demo without hand-seeding every credential/name/email every
 * time. Bring your own generator (Faker.js or anything else) - waygraph takes
 * no dependency on one, it only stores and invokes an opaque `() => T`.
 *
 * "Stub" here is unrelated to the other two meanings already in this
 * codebase: `stubBefore`/`stubAfter`/`stubOnError` (demo narration fixtures,
 * see highlights.ts's `runStubPhase`) and `upload`'s `stub: "image"|"pdf"|
 * "video"` (a placeholder file). This is a third, separate "stub."
 *
 * Opt-in only, per Flow (`withMemStub`, engine.ts) or per-run (`--mem-stub` /
 * WAYGRAPH_MEM_STUB=1) - a required key with no registered generator still
 * fails preflight exactly as before. Registered per MemKey *instance*
 * (identity, not `.name`), matching MemPage's own store - two keys sharing a
 * debug name must never cross-contaminate here either.
 */
import type { MemKey } from "./mem-page.js";
import type { MemPage } from "./mem-page.js";
import type { Flow } from "./engine.js";

const registry = new Map<MemKey<any>, () => unknown>();

/**
 * Registers a fake-value generator for one required MemKey.
 * @example registerMemStub(LoginCreds.key, () => ({
 *   username: faker.internet.userName(),
 *   password: faker.internet.password(),
 * }));
 */
export function registerMemStub<T>(key: MemKey<T>, fake: () => T): void {
  registry.set(key, fake);
}

/** Used by waygraph's own `--mem-stub`-aware CLI seeding and by {@link seedMemStub} - flow authors normally use {@link registerMemStub}/{@link withMemStub} instead. */
export function getMemStub<T>(key: MemKey<T>): (() => T) | undefined {
  return registry.get(key) as (() => T) | undefined;
}

/**
 * For a bare library `flow.run(mem, ...)` call outside the CLI (which has its
 * own `--mem-stub`-aware seeding) - call this yourself before `run()` when
 * `flow.memStub` is true, the same way external tooling already reads
 * `flow.resetSession`/`flow.title`/etc. (`run()` itself never reads Flow
 * flags - see the `with*` helpers in engine.ts).
 * @example
 * if (flow.memStub) seedMemStub(mem, flow);
 * await flow.run(mem, config);
 */
export function seedMemStub(mem: MemPage, flow: Flow<any>): void {
  for (const bi of flow.blocks()) {
    for (const k of bi.block.requires ?? []) {
      if (mem.has(k)) continue;
      const fake = registry.get(k);
      if (fake) mem.set(k, fake());
    }
  }
}
