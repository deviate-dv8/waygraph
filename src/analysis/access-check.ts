// `waygraph check`: a flow that runs as an account (`map({ as })`) and uses something that account isn't given (`for`):
// a layout's link, a Method, or a page. The access tests would find the button missing or the page not opening; this
// says so before anything runs.
import { relative } from "node:path";
import { givenTo } from "../engine/block/access.js";
import { scanProject } from "../manifest/project.js";

/** A step a flow takes as an account that isn't given it. */
export interface AccessWarning {
  file: string;
  flow: string;
  account: string;
  /** The step's Block, or the page it lands on. */
  what: string;
  given: readonly string[];
}

const SIGN_IN = "sign-in-as-";

interface StepInfo {
  name: string;
  block: { __waygraphTo?: readonly string[]; steps?: () => StepInfo[] };
}

/** A flow's steps, a nested flow's included. */
function stepsOf(infos: readonly StepInfo[]): StepInfo[] {
  return infos.flatMap((info) => [info, ...(typeof info.block.steps === "function" ? stepsOf(info.block.steps()) : [])]);
}

/** Every step a flow as an account takes that the account isn't given. */
export async function checkAccess(projectDir: string): Promise<AccessWarning[]> {
  const scan = await scanProject(projectDir, { maps: false });
  // Who can open each page, by its Page Block.
  const pageGiven = new Map<string, readonly string[]>();
  for (const { block } of scan.blocks) {
    const given = givenTo(block);
    if (given && (block as { __waygraphKind?: string }).__waygraphKind === "page") {
      for (const tag of (block as { __waygraphTo?: readonly string[] }).__waygraphTo ?? []) pageGiven.set(tag, given);
    }
  }
  const warnings: AccessWarning[] = [];
  for (const { flow, exportName, absFile } of scan.flows) {
    const steps = stepsOf(flow.blocks() as StepInfo[]);
    const account = steps.find((s) => s.name.startsWith(SIGN_IN))?.name.slice(SIGN_IN.length);
    if (!account) continue;
    const seen = new Set<string>();
    const warn = (what: string, given: readonly string[]) => {
      if (given.includes(account) || seen.has(what)) return;
      seen.add(what);
      warnings.push({ file: relative(projectDir, absFile), flow: exportName, account, what, given });
    };
    for (const step of steps) {
      const given = givenTo(step.block);
      if (given) warn(step.name, given);
      // A step onto a page it isn't given (a Page Block's own `for` already said so).
      if ((step.block as { __waygraphKind?: string }).__waygraphKind === "page") continue;
      for (const tag of step.block.__waygraphTo ?? []) {
        const page = pageGiven.get(tag);
        if (page) warn(`page ${tag}`, page);
      }
    }
  }
  return warnings;
}
