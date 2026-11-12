// What to play: the CLI spec ("cartFlow", or "loginFlow then add-item({...})") turned into the steps to play, each
// knowing its episode, its flow's settings and when to seed its segment's mem.
import type { MemPage } from "../../engine/mem/mem.js";
import { buildFlow } from "../../engine/flow/flow.js";
import type { BlockInfo, Flow } from "../../engine/flow/flow.js";
import { isFastForwardBlock } from "../../engine/block/compose.js";
import type { PlayStep } from "../mode.js";
import type { PlayOptions } from "../options.js";
import { findBlock, findFlow } from "./find.js";
import { seedMemForBlock, seedMemForFlow } from "./seed-mem.js";
import { parseChainSpec } from "./spec.js";
import { loadAccounts, loadMemStubs } from "../../manifest/project.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { recordMem } from "../../engine/run/events.js";
import { accountKeys, accountSigningIn } from "../../engine/flow/account.js";
import { getMemStub, memStubIsConstant } from "../../engine/mem/mem-stub.js";
import { readRunLog } from "../../runtime/run-log.js";
import type { Checkpoint } from "../../engine/checkpoint/checkpoint.js";
import type { SomeBlock } from "../../engine/block/some-block.js";

/** One part of the spec: a named Flow, or a single Block wrapped as one. */
interface Segment {
  flow: Flow<Checkpoint<string>>;
  ref: string;
  /** A named Flow is an episode in the demo; a bare Block isn't. */
  named: boolean;
  seedMem: () => void;
}

export interface Plan {
  steps: PlayStep[];
  /** One Flow per segment (`--all-branches` needs exactly one). */
  flows: Flow<Checkpoint<string>>[];
}

export async function planSteps(projectDir: string, spec: string, mem: MemPage, options: PlayOptions): Promise<Plan> {
  // A flow's keys may come from mem stubs: load them, whether or not a flow file imports them.
  await loadMemStubs(projectDir);
  // Whose sign-in a flow is (src/accounts/): played on its own, it signs in as that person.
  await loadAccounts(projectDir);
  const bareFlow = await findBareFlow(projectDir, spec);
  const inputs = options.input === undefined ? undefined : readInputs(projectDir, options.input, bareFlow, spec);
  const recorded = options.replay ? recordedMem(projectDir, options.replay) : undefined;
  // A replayed run that played one flow once per input plays it as many times again, each with its recorded mem.
  const runs = inputs?.length ?? (bareFlow && recorded && recorded.size > 1 ? recorded.size : 1);
  const segments = bareFlow
    ? Array.from({ length: runs }, (_, i) => flowSegment(bareFlow, runs > 1 ? `${spec.trim()} #${i + 1}` : spec.trim(), undefined, mem, options, inputs?.[i]))
    : await Promise.all(parseSegments(spec).map((seg) => resolveSegment(projectDir, seg, mem, options)));
  segments.forEach((segment, index) => {
    segment.seedMem = seeding(segment, index, mem, recorded);
  });
  const steps = stepsOf(segments, options, { episodes: !bareFlow || segments.length > 1 });
  if (options.mode !== "report") announce(spec, steps, !!bareFlow, options);
  return { steps, flows: segments.map((s) => s.flow) };
}

/** `--input`: JSON or `@file.json`, for one flow that takes input; an array is one value per run of the flow. */
function readInputs(projectDir: string, raw: string, flow: Flow<Checkpoint<string>> | undefined, spec: string): unknown[] {
  if (!flow?.input) throw new Error(`waygraph: --input needs one flow that takes input (map({ input })) - "${spec.trim()}" ${flow ? "takes none" : "is not one flow"}`);
  const text = raw.startsWith("@") ? readFileSync(resolve(projectDir, raw.slice(1)), "utf8") : raw;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (err) {
    throw new Error(`waygraph: --input is not valid JSON - ${String(err)}`);
  }
  return Array.isArray(value) ? value : [value];
}

/** The mem each segment of a recorded run was seeded with (its run log's run:mem events), by segment index. */
function recordedMem(projectDir: string, runId: string): Map<number, Record<string, unknown>> {
  const recorded = new Map<number, Record<string, unknown>>();
  for (const event of readRunLog(projectDir, runId)) if (event.type === "run:mem") recorded.set(event.segment, event.values);
  return recorded;
}

/**
 * A segment's seeding, recorded: the values its Blocks' required keys end up with go into the run log (run:mem), so
 * `--replay <runId>` can set them again - which it does here instead of seeding. A value made new every run (its mem
 * stub gives a different one each time: a name from `unique`, what the run creates) is made new again: replayed, the
 * same machine or signup would be made twice, and the app would refuse the second.
 */
function seeding(segment: Segment, index: number, mem: MemPage, recorded: Map<number, Record<string, unknown>> | undefined): () => void {
  const keys = [...new Map(segment.flow.blocks().flatMap((info) => info.block.requires ?? []).map((k) => [k.name, k])).values()];
  const seed = segment.seedMem;
  return () => {
    if (recorded) {
      const values = recorded.get(index);
      if (!values) {
        // A run that recorded no data for this part (an older run, or another spec): nothing to replay; it plays as new.
        console.error(`waygraph: --replay: that run recorded no data for part ${index + 1} ("${segment.ref}"); playing it with new data`);
        seed();
        recordMem(index, segment.ref, Object.fromEntries(keys.filter((k) => mem.has(k)).map((k) => [k.name, mem.get(k)])), segment.flow.meta);
        return;
      }
      for (const k of keys) {
        if (!(k.name in values)) continue;
        const fresh = memStubIsConstant(k) === false ? getMemStub(k) : undefined;
        mem.set(k, fresh ? fresh() : values[k.name]);
      }
    } else {
      seed();
    }
    recordMem(index, segment.ref, Object.fromEntries(keys.filter((k) => mem.has(k)).map((k) => [k.name, mem.get(k)])), segment.flow.meta);
  };
}

/** A spec that is just a name might be an existing Flow (`cartFlow`); then no chain spec is needed. */
async function findBareFlow(projectDir: string, spec: string): Promise<Flow<Checkpoint<string>> | undefined> {
  const ref = spec.trim();
  if (!/^[A-Za-z_$][\w]*$/.test(ref)) return undefined;
  const flow = await findFlow(projectDir, ref);
  return flow && typeof flow.blocks === "function" ? flow : undefined;
}

function parseSegments(spec: string): { ref: string; json?: string }[] {
  const segments = parseChainSpec(spec);
  if (segments.length === 0) throw new Error("waygraph run --blocks: empty spec - give at least one block name");
  return segments;
}

async function resolveSegment(projectDir: string, seg: { ref: string; json?: string }, mem: MemPage, options: PlayOptions): Promise<Segment> {
  const flow = await findFlow(projectDir, seg.ref);
  if (flow && typeof flow.blocks === "function") return flowSegment(flow, seg.ref, seg.json, mem, options);
  const found = await findBlock(projectDir, seg.ref);
  if (!found) throw new Error(`waygraph: no Block or Flow named "${seg.ref}"`);
  return {
    flow: buildFlow([found.block as SomeBlock], {}),
    ref: seg.ref,
    named: false,
    // A bare Block has no map({ memStub }) to opt in; only --mem-stub fills its keys.
    seedMem: () => seedMemForBlock(mem, found, seg.json, options.memStub),
  };
}

function flowSegment(flow: Flow<Checkpoint<string>>, ref: string, json: string | undefined, mem: MemPage, options: PlayOptions, input?: unknown): Segment {
  // seeded when the segment starts, not now: two segments may give the same key different values
  const seedMem = () => {
    // The flow's input (--input) is set first, and an account's sign-in flow played on its own signs in as its person;
    // the rest of its requires seed as usual.
    if (flow.input && input !== undefined) mem.set(flow.input, input);
    const person = accountSigningIn(flow);
    person?.mem?.(mem);
    const given = [...(input !== undefined && flow.input ? [flow.input] : []), ...(person ? accountKeys(person) : [])];
    seedMemForFlow(mem, flow.blocks(), json, ref, flow.memStub === true || options.memStub, given);
  };
  return { flow, ref, named: true, seedMem };
}

/** A fast-forward unit is one step, unless --ff-expand plays its inner Blocks one by one. */
function expand(infos: readonly BlockInfo[], options: PlayOptions): (BlockInfo & { wasFastForward?: true; ffSource?: string })[] {
  if (!options.ffExpand) return [...infos];
  return infos.flatMap((info) =>
    isFastForwardBlock(info.block)
      ? info.block.steps().map((inner) => ({
          ...inner,
          ...(info.resetSessionBefore ? { resetSessionBefore: true } : {}),
          wasFastForward: true as const,
          ffSource: info.block.name,
        }))
      : [info],
  );
}

/**
 * Whether a segment of `run "a then b"` starts with a fresh session: when it follows another and wants one
 * (`map({ sessionReset: true })`), or when its first step resets (`.flow(sub, { reset: true })`).
 */
export function startsFresh(flow: Pick<Flow<Checkpoint<string>>, "resetSession" | "blocks">, segmentIndex: number): boolean {
  return (segmentIndex > 0 && flow.resetSession) || !!flow.blocks()[0]?.resetSessionBefore;
}

function stepsOf(segments: readonly Segment[], options: PlayOptions, { episodes }: { episodes: boolean }): PlayStep[] {
  let episode = 0;
  return segments.flatMap((segment, segmentIndex) => {
    const episodeNumber = episodes && segment.named ? ++episode : undefined;
    const infos = expand(segment.flow.blocks(), options);
    const last = infos.length - 1 - [...infos].reverse().findIndex((info) => !info.cleanup);
    return infos.map((info, i): PlayStep => ({
      block: info.block,
      exportName: info.name,
      config: segment.flow.config,
      episodeNumber,
      episodeTitle: episodeNumber === undefined ? undefined : (segment.flow.meta?.title ?? segment.ref),
      ...(i === 0 && segment.flow.meta?.title ? { flowTitle: segment.flow.meta.title } : {}),
      ...(i === 0 && segment.flow.meta?.description ? { flowDescription: segment.flow.meta.description } : {}),
      resetSession: i === 0 && startsFresh(segment.flow, segmentIndex),
      seedMem: i === 0 ? segment.seedMem : undefined,
      expectedFailureReason: i === last ? segment.flow.expectedFailureReason : undefined,
      segment: segmentIndex,
      ...(i === 0 && segment.flow.device ? { viewport: segment.flow.device.viewport } : {}),
      ...(info.cleanup ? { cleanup: true } : {}),
      demoPace: segment.flow.demoPace,
      highlightStyle: segment.flow.highlightStyle,
      ...(info.wasFastForward ? { wasFastForward: true, ffSource: info.ffSource } : {}),
    }));
  });
}

function announce(spec: string, steps: readonly PlayStep[], bare: boolean, options: PlayOptions): void {
  const names = steps.map((s) => s.block.name).join(" -> ");
  const count = steps.length + " block" + (steps.length === 1 ? "" : "s");
  if (bare) {
    console.log(`waygraph: running existing flow "${spec.trim()}" - ${names} (${count}, no chain spec needed)`);
    if (options.ffDisabled) {
      console.error("waygraph demo: --ff-disabled - FFCompose expanded to inners (dispute / step locus); blitz pacing kept on former FF steps");
    }
  } else {
    console.log(`waygraph: chaining ${names} (${count})`);
  }
}
