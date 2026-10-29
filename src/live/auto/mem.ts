// Mem for a live session: --data first, then the project's mem stubs; the terminal prompt for what is missing.
import { messageOf } from "../../engine/errors.js";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { envString } from "../../engine/env.js";
import { getMemStub } from "../../engine/mem/mem-stub.js";
import { MemPage, type MemKey } from "../../engine/mem/mem.js";
import type { BlockEntry } from "../../manifest/project.js";
import type { Page } from "@playwright/test";


export function missingMemKeys(entry: BlockEntry, mem: MemPage): MemKey<unknown>[] {
  const requires = entry.block.requires ?? [];
  return requires.filter((k) => !mem.has(k));
}
/** The project's own default for a key: its `registerMemStub` fake (live sessions load every `*.mem-stubs.ts`). */

export function memStubValue(key: MemKey<unknown>): unknown | undefined {
  return getMemStub(key)?.();
}
export function defaultMemJsonPrompt(key: MemKey<unknown>): string {
  const def = memStubValue(key);
  return def === undefined ? "{}" : JSON.stringify(def);
}
export function seedMemFromEnv(mem: MemPage, entry: BlockEntry): boolean {
  const raw = envString("WAYGRAPH_DATA");
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const k of entry.block.requires ?? []) {
      if (k.name in parsed) mem.set(k, parsed[k.name]);
    }
    return missingMemKeys(entry, mem).length === 0;
  } catch {
    return false;
  }
}
/** Pre-seeds required keys from WAYGRAPH_DATA and the project's mem stubs, so a session does not stop for mem forms. */

export function seedDefaultMem(library: Map<string, BlockEntry>, mem: MemPage, dataJson?: string): void {
  const raw = dataJson ?? envString("WAYGRAPH_DATA");
  let envParsed: Record<string, unknown> = {};
  if (raw) {
    try {
      envParsed = JSON.parse(raw) as Record<string, unknown>;
    } catch (err) {
      throw new Error(`waygraph: --data / WAYGRAPH_DATA is not valid JSON: ${messageOf(err)}`);
    }
  }
  for (const entry of library.values()) {
    for (const k of entry.block.requires ?? []) {
      if (mem.has(k)) continue;
      if (k.name in envParsed) {
        mem.set(k, envParsed[k.name]);
        continue;
      }
      const def = memStubValue(k);
      if (def !== undefined) mem.set(k, def);
    }
  }
}
export async function promptMemCli(entry: BlockEntry, mem: MemPage): Promise<void> {
  const rl = createInterface({ input, output });
  try {
    for (const k of missingMemKeys(entry, mem)) {
      const def = defaultMemJsonPrompt(k);
      const line = await rl.question(`  ${k.name} JSON [${def}]: `);
      const json = line.trim() || def;
      mem.set(k, JSON.parse(json));
    }
  } finally {
    rl.close();
  }
}
export async function ensureMem(entry: BlockEntry, mem: MemPage, cli: boolean): Promise<void> {
  if (missingMemKeys(entry, mem).length === 0) return;
  if (seedMemFromEnv(mem, entry)) return;
  if (cli) {
    console.log(`\nBlock "${entry.block.name}" needs MemPage keys:`);
    await promptMemCli(entry, mem);
    return;
  }
  throw new Error(
    `Block "${entry.block.name}" needs MemPage keys - pass --data '{...}' / WAYGRAPH_DATA, or enter values in --cli`
  );
}


/** Whether mem, or a mem stub, already holds the key a Block's live options set (which row to act on). */
export async function optionChosen(entry: BlockEntry, page: Page, mem: MemPage): Promise<boolean> {
  if (!entry.block.instanceOptions) return false;
  const options = await entry.block.instanceOptions(page);
  const keys = new Set(options.map((o) => o.key));
  return keys.size > 0 && [...keys].every((k) => mem.has(k) || getMemStub(k) !== undefined);
}
