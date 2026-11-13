// `waygraph check`: a flow that lands on a page needing a state (signed in) before anything has set it. The run fails that
// step (WG_STATE_NEEDED); this says so before anything runs, by walking the flow's steps with the states each one sets.
import { relative } from "node:path";
import { allAccounts } from "../engine/flow/account.js";
import { paneOf } from "../engine/run/pane-page.js";
import { MemPage, type MemKey } from "../engine/mem/mem.js";
import { setState, setsOf, statesIn, unmetNeeds, type StateValue } from "../engine/mem/state.js";
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
    const steps = stepsOf(flow.blocks() as StepInfo[]);
    // One person, one state: a flow with panes keeps each pane's states apart, and a pane is signed in as its own account.
    const mem = new MemPage();
    const seen = new Set<string>();
    steps.forEach((step, i) => {
      const pane = paneOf(step.block);
      const who = pane?.name;
      const paneAccount = pane ? (pane.panes as Record<string, { as?: { mem?: (m: MemPage) => void } }>)[pane.name]?.as : undefined;
      if (paneAccount?.mem && who !== undefined && !seen.has(`pane|${who}`)) {
        seen.add(`pane|${who}`);
        const scratch = new MemPage();
        paneAccount.mem(scratch);
        for (const [key, value] of statesIn(scratch)) setState(mem, key, value, who);
      }
      const named = step.name.startsWith("sign-in-as-") ? accounts.get(step.name.slice("sign-in-as-".length)) : undefined;
      if (named?.mem) {
        const scratch = new MemPage();
        named.mem(scratch);
        for (const [key, value] of statesIn(scratch)) setState(mem, key, value, who);
        if (who === undefined) named.mem(mem);
      }
      const to = step.block.__waygraphTo ?? [];
      // Where a step with several outcomes lands: the one the next step starts from, else the first.
      const next = steps[i + 1]?.block.__waygraphFrom ?? [];
      const landed = to.find((t) => next.includes(t)) ?? to[0];
      if (landed === undefined || landed === "*") return;
      for (const [key, value] of setsOf(step.block, { __state: landed } as Checkpoint<string>)) setState(mem, key as MemKey<StateValue>, value, who);
      const missing = unmetNeeds(landed, mem, who);
      if (missing.length && !seen.has(`${who}|${landed}`)) {
        seen.add(`${who}|${landed}`);
        warnings.push({ file: relative(projectDir, absFile), flow: exportName, step: step.name, page: landed, missing });
      }
    });
  }
  return warnings;
}
