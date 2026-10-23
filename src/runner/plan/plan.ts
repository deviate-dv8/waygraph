// What to play: the CLI spec ("cartFlow", or "loginFlow then add-item({...})") turned into the steps to play, each
// knowing its episode, its flow's settings and when to seed its segment's mem.
import type { MemPage } from "../../engine/mem/mem.js";
import { buildFlow, chainFlow } from "../../engine/flow/flow.js";
import type { BlockInfo, Flow } from "../../engine/flow/flow.js";
import { isFastForwardBlock } from "../../engine/block/compose.js";
import type { PlayStep } from "../mode.js";
import type { PlayOptions } from "../options.js";
import { findBlock, findFlow } from "./find.js";
import { seedMemForBlock, seedMemForFlow } from "./seed-mem.js";
import { parseChainSpec } from "./spec.js";
import type { Checkpoint } from "../../engine/checkpoint/checkpoint.js";
import type { SomeBlock } from "../../engine/block/block.js";

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
  const bareFlow = await findBareFlow(projectDir, spec);
  const segments = bareFlow
    ? [flowSegment(bareFlow, spec.trim(), undefined, mem, options)]
    : await Promise.all(parseSegments(spec).map((seg) => resolveSegment(projectDir, seg, mem, options)));
  const steps = stepsOf(segments, options, { episodes: !bareFlow });
  if (options.mode !== "report") announce(spec, steps, !!bareFlow, options);
  return { steps, flows: segments.map((s) => s.flow) };
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
  if (segments.length === 0) throw new Error("waygraph chain: empty spec - give at least one block name");
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

function flowSegment(flow: Flow<Checkpoint<string>>, ref: string, json: string | undefined, mem: MemPage, options: PlayOptions): Segment {
  // seeded when the segment starts, not now: two segments may give the same key different values
  const seedMem = () => seedMemForFlow(mem, flow.blocks(), json, ref, flow.memStub === true || options.memStub);
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

function stepsOf(segments: readonly Segment[], options: PlayOptions, { episodes }: { episodes: boolean }): PlayStep[] {
  // chainFlow marks each segment's first Block when that segment wants a fresh session.
  const resets = new Set(chainFlow(...segments.map((s) => s.flow)).blocks().filter((b) => b.resetSessionBefore).map((b) => b.block));
  let episode = 0;
  return segments.flatMap((segment) => {
    const episodeNumber = episodes && segment.named ? ++episode : undefined;
    const infos = expand(segment.flow.blocks(), options);
    return infos.map((info, i): PlayStep => ({
      block: info.block,
      exportName: info.name,
      config: segment.flow.config,
      episodeNumber,
      episodeTitle: episodeNumber === undefined ? undefined : segment.ref,
      resetSession: i === 0 && resets.has(segment.flow.blocks()[0]?.block as SomeBlock),
      seedMem: i === 0 ? segment.seedMem : undefined,
      expectedFailureReason: i === infos.length - 1 ? segment.flow.expectedFailureReason : undefined,
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
