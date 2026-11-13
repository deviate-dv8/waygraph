// `waygraph check`: a flow that lands on a page needing a state (signed in) before anything has set it. The run fails that
// step (WG_STATE_NEEDED); this says so before anything runs, by walking the flow's steps with the states each one sets.
import { relative } from "node:path";
import { allAccounts } from "../engine/flow/account.js";
import { paneOf } from "../engine/run/pane-page.js";
import { MemPage } from "../engine/mem/mem.js";
import { needsFor, setsOf, stateNow } from "../engine/mem/state.js";
import { scanProject } from "../manifest/project.js";
import type { Checkpoint } from "../engine/checkpoint/checkpoint.js";

/** A step that lands on a page whose state the flow isn't in. */
export interface StateWarning {
  file: string;
  flow: string;
  step: string;
  page: string;
  /** The states it needs that nothing before it set. */
  missing: string[];
}

interface StepInfo {
  name: string;
  block: { __waygraphTo?: readonly string[]; __waygraphFrom?: readonly string[]; steps?: () => StepInfo[] };
}

const stepsOf = (infos: readonly StepInfo[]): StepInfo[] => infos.flatMap((info) => [info, ...(typeof info.block.steps === "function" ? stepsOf(info.block.steps()) : [])]);

/** Each flow's steps walked in order: an account's sign-in brings its states, a step's `sets` change them, a landing page's `needs` are checked. */
export async function checkStates(projectDir: string): Promise<StateWarning[]> {
  const scan = await scanProject(projectDir, { maps: false });
  const accounts = new Map(allAccounts().map((a) => [a.name, a]));
  const warnings: StateWarning[] = [];
  for (const { flow, exportName, absFile } of scan.flows) {
    // A flow with panes is two people, each signed in as their own account; one mem can't say who is in which state.
    const steps = stepsOf(flow.blocks() as StepInfo[]);
    if (steps.some((s) => paneOf(s.block))) continue;
    const mem = new MemPage();
    const seen = new Set<string>();
    steps.forEach((step, i) => {
      const account = step.name.startsWith("sign-in-as-") ? accounts.get(step.name.slice("sign-in-as-".length)) : undefined;
      account?.mem?.(mem);
      const to = step.block.__waygraphTo ?? [];
      // Where a step with several outcomes lands: the one the next step starts from, else the first.
      const next = steps[i + 1]?.block.__waygraphFrom ?? [];
      const landed = to.find((t) => next.includes(t)) ?? to[0];
      if (landed === undefined || landed === "*") return;
      for (const [key, value] of setsOf(step.block, { __state: landed } as Checkpoint<string>)) mem.set(key, value);
      const missing = needsFor(landed).filter((key) => !stateNow(mem, key)).map((k) => k.name);
      if (missing.length && !seen.has(`${landed}`)) {
        seen.add(landed);
        warnings.push({ file: relative(projectDir, absFile), flow: exportName, step: step.name, page: landed, missing });
      }
    });
  }
  return warnings;
}
