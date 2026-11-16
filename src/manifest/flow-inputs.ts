import { accountKeys, allAccounts } from "../engine/flow/account.js";
import { getMemStub } from "../engine/mem/mem-stub.js";
import type { MemKey } from "../engine/mem/mem.js";
import type { SomeBlock } from "../engine/block/some-block.js";

/** A value a flow needs from whoever plays it (credentials, a record's name): not set by a step, not an account's. */
export interface FlowInput {
  /** The mem key's name, `saucedemo.credentials`: what `--data` calls it. */
  key: string;
  /** What the key's mem stub gives, as the starting point of the form; missing without a stub. */
  example?: unknown;
  /** The flow fills it itself from the stub (`memStub`), so playing without a value works. */
  filled: boolean;
}

/** The keys a flow's steps require that nothing in the flow gives, with what the stub offers for each. */
export function flowInputs(steps: readonly { name: string; block: SomeBlock }[], memStub: boolean): FlowInput[] {
  const given = new Set<string>();
  for (const step of steps) {
    if (step.name.startsWith("set-")) given.add(step.name.slice(4));
    const account = step.name.startsWith("sign-in-as-") ? allAccounts().find((a) => a.name === step.name.slice("sign-in-as-".length)) : undefined;
    if (account) for (const key of accountKeys(account)) given.add(key.name);
  }
  const keys = new Map<string, MemKey<unknown>>();
  for (const step of steps) for (const key of step.block.requires ?? []) if (!given.has(key.name)) keys.set(key.name, key);
  return [...keys.values()].map((key) => {
    const stub = getMemStub(key);
    let example: unknown;
    try {
      example = stub?.();
    } catch {
      example = undefined;
    }
    return { key: key.name, ...(example !== undefined ? { example } : {}), filled: memStub && stub !== undefined };
  });
}
