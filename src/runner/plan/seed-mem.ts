// Fills mem for a segment from its --data / inline JSON, or from registerMemStub fakes when --mem-stub is on.
import type { MemKey, MemPage } from "../../engine/mem/mem.js";
import type { BlockInfo } from "../../engine/flow/flow.js";
import type { FoundBlock } from "./find.js";
import { getMemStub } from "../../engine/mem/mem-stub.js";
import { envString } from "../../engine/env.js";

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

function seedMemFromRequires(mem: MemPage, requires: readonly MemKey<unknown>[], json: string | undefined, label: string, stubActive: boolean): void {
  if (requires.length === 0) {
    if (json !== undefined) {
      throw new Error(
        "waygraph run --blocks: \"" + label + "\" takes no input (empty requires) but got a payload: " + json,
      );
    }
    return;
  }
  if (json === undefined) {
    // --data / WAYGRAPH_DATA supplies the same payload shape as blockName({...}).
    const fromEnv = envString("WAYGRAPH_DATA");
    if (fromEnv && fromEnv.trim()) json = fromEnv;
  }

  let parsed: unknown;
  let haveParsed = false;
  if (json !== undefined) {
    try {
      parsed = JSON.parse(json);
      haveParsed = true;
    } catch (err) {
      throw new Error("waygraph run --blocks: \"" + label + "\" payload is not valid JSON - " + String(err));
    }
  }

  if (!haveParsed) {
    // No payload at all - only a hard failure when memStub isn't active for
    // this flow; when it is, fall through with an empty object so the
    // per-key loop below gets a chance to fill each one from the registry.
    if (!stubActive) {
      throw new Error(
        "waygraph run --blocks: \"" + label + "\" requires " + requires.map((k) => k.name).join(", ") +
          " - give a JSON payload (inline blockName({...}) or --data '{...}'), or enable --mem-stub" +
          " with registerMemStub for these keys",
      );
    }
    parsed = {};
  }

  // Keyed-by-name when every require name is a top-level key (preferred for
  // --data and for {"saucedemo.credentials":{...}} even with one require).
  if (isRecord(parsed)) {
    const payload = parsed;
    if (requires.every((k) => k.name in payload)) {
      for (const k of requires) mem.set(k, payload[k.name]);
      return;
    }
  }
  // Single-key shorthand: the whole payload IS that one key's value - only
  // when a real payload was actually given (the stub-only "{}" fallback
  // above must fall through to per-key stub resolution instead).
  if (haveParsed && requires.length === 1) {
    mem.set(requires[0]!, parsed);
    return;
  }
  if (!isRecord(parsed)) {
    throw new Error(
      "waygraph run --blocks: \"" + label + "\" requires " + requires.length + " keys (" +
        requires.map((k) => k.name).join(", ") + ") - payload must be an object keyed by each key's name",
    );
  }
  const payload = parsed;
  const stillMissing: MemKey<unknown>[] = [];
  for (const k of requires) {
    if (k.name in payload) {
      mem.set(k, payload[k.name]);
      continue;
    }
    const fake = stubActive ? getMemStub(k) : undefined;
    if (fake) {
      mem.set(k, fake());
      continue;
    }
    stillMissing.push(k);
  }
  if (stillMissing.length > 0) {
    throw new Error(
      "waygraph run --blocks: \"" + label + "\" payload is missing required key(s): " +
        stillMissing.map((k) => "\"" + k.name + "\"").join(", "),
    );
  }
}


export function seedMemForBlock(mem: MemPage, resolved: FoundBlock, json: string | undefined, stubActive: boolean): void {
  seedMemFromRequires(mem, resolved.block.requires ?? [], json, resolved.exportName, stubActive);
}


/**
 * Same idea as seedMemForBlock, but for a whole Flow segment
 * ("loginFlow({...}) then ...") - a Flow has no single .requires of its
 * own, so this unions every constituent Block's requires (deduped by key
 * name) and seeds them all from one JSON payload, same keyed-by-name shape
 * as a multi-key Block payload already uses.
 */
export function seedMemForFlow(mem: MemPage, flowBlocks: readonly BlockInfo[], json: string | undefined, label: string, stubActive: boolean): void {
  const seen = new Map<string, MemKey<unknown>>();
  for (const bi of flowBlocks) {
    for (const k of bi.block.requires ?? []) {
      if (!seen.has(k.name)) seen.set(k.name, k);
    }
  }
  seedMemFromRequires(mem, Array.from(seen.values()), json, label, stubActive);
}
