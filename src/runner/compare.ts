// `--compare as=a,b | device=a,b | config=a,b`: one flow played twice, side by side, step by step: the two sides are the
// two panes of one run (each step plays on one side, then the other, before the next), and after each step the run
// says where they differ (where each landed, whether it passed, what the page read). A side that fails stops; the other
// plays on. Differences go in the run log (`compare:diff`) and in a summary at the end; only failures fail the run.
import { allAccounts } from "../engine/flow/account.js";
import { inPane, installPanes, type PaneConfig, type Panes } from "../engine/flow/panes.js";
import { closesPane, closingStep } from "../engine/flow/map-steps.js";
import { onRunEvent, recordDiff, type StepDiff } from "../engine/run/events.js";
import { paneName, paneOf } from "../engine/run/pane-page.js";
import { messageOf } from "../engine/errors.js";
import { readNamedConfig } from "../runtime/waygraph-config.js";
import type { Device } from "../engine/flow/device.js";
import type { Mode, PlayStep } from "./mode.js";
import type { PlayOptions } from "./options.js";

type Compare = NonNullable<PlayOptions["compare"]>;

/** One side of the comparison, as a pane. */
async function sideOf(projectDir: string, compare: Compare, value: string): Promise<PaneConfig> {
  if (compare.by === "device") return { device: value as Device };
  if (compare.by === "config") {
    const baseUrl = (await readNamedConfig(projectDir, value)).baseUrl;
    if (!baseUrl) throw new Error(`waygraph: --compare config=…: the "${value}" config has no baseUrl`);
    return { baseUrl };
  }
  const account = allAccounts().find((a) => a.name === value);
  if (!account) throw new Error(`waygraph: --compare as=…: no account "${value}" (the project has ${allAccounts().map((a) => a.name).join(", ") || "none"})`);
  return { as: account };
}

/**
 * The steps played on both sides: each one on the first side, then on the second. A flow on one page plays as two panes
 * named for the sides; a flow with panes plays each of its panes once per side (`planner (desktop)`), each side's with
 * that side's device or config, and, compared by account, the pane the flow starts in signed in as that side's.
 */
export async function compareSteps(projectDir: string, steps: readonly PlayStep[], compare: Compare): Promise<PlayStep[]> {
  const [a, b] = compare.sides;
  const names: [string, string] = a === b ? [`${a} (1)`, `${b} (2)`] : [a, b];
  const sides = [await sideOf(projectDir, compare, a), await sideOf(projectDir, compare, b)] as const;
  const own = steps.map((s) => paneOf(s.block)).find((pane) => pane !== undefined);
  installPanes();
  // Compared as two accounts, each side signs in as its own: the flow's own sign-in step goes, and what a segment does
  // on its first step (seed its data, size the page) moves to the step after it.
  const played: PlayStep[] = [];
  let carried: Partial<PlayStep> = {};
  for (const step of steps) {
    if (!own && compare.by === "as" && step.block.name.startsWith("sign-in-as-")) {
      carried = { ...carried, ...(step.seedMem ? { seedMem: step.seedMem } : {}), ...(step.viewport ? { viewport: step.viewport } : {}) };
      continue;
    }
    played.push({ ...step, ...carried });
    carried = {};
  }
  if (!own) {
    const panes: Panes = { [names[0]]: sides[0], [names[1]]: sides[1] };
    return played.flatMap((step) => names.map((name) => ({ ...step, block: inPane(step.block, name, panes), compareSide: name })));
  }
  // A flow with panes: each pane once per side.
  const flowPanes = own.panes as Panes;
  const first = own.name;
  const paneFor = (pane: string, side: string) => `${pane} (${side})`;
  const panes: Panes = Object.fromEntries(
    names.flatMap((side, i) =>
      Object.entries(flowPanes).map(([pane, options]) => {
        const changed = sides[i]!;
        const shared = options.with !== undefined;
        return [
          paneFor(pane, side),
          {
            ...options,
            ...(shared ? { with: paneFor(options.with!, side) } : {}),
            ...(changed.device !== undefined ? { device: changed.device } : {}),
            ...(changed.baseUrl !== undefined && !shared ? { baseUrl: changed.baseUrl } : {}),
            ...(changed.as && pane === first ? { as: changed.as } : {}),
          },
        ];
      }),
    ),
  );
  return played.flatMap((step) =>
    names.map((side) => {
      const pane = paneOf(step.block)?.name ?? first;
      // A `.close(pane)` closes that side's pane.
      const closes = closesPane(step.block);
      const block = closes ? closingStep(paneFor(closes, side)) : step.block;
      return { ...step, block: inPane(block, paneFor(pane, side), panes), compareSide: side };
    }),
  );
}

/** What a side was left with after a step: where it landed (or that it failed) and what the page read. */
interface Side {
  landed?: string;
  failed?: string;
  read: Record<string, unknown>;
}

/** Each field of a read, flattened: `cart.lines` -> its value. */
function fields(read: Record<string, unknown>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [ns, group] of Object.entries(read)) {
    if (group && typeof group === "object" && !Array.isArray(group)) {
      for (const [field, value] of Object.entries(group)) out.set(`${ns}.${field}`, JSON.stringify(value));
    } else {
      out.set(ns, JSON.stringify(group));
    }
  }
  return out;
}

/** Where two sides differ after a step. */
function differences(left: Side, right: Side): StepDiff[] {
  const diffs: StepDiff[] = [];
  if ((left.failed ?? "passed") !== (right.failed ?? "passed")) diffs.push({ what: "outcome", values: [left.failed ?? "passed", right.failed ?? "passed"] });
  if (!left.failed && !right.failed && left.landed !== right.landed) diffs.push({ what: "landed", values: [left.landed, right.landed] });
  if (!left.failed && !right.failed) {
    const l = fields(left.read);
    const r = fields(right.read);
    for (const key of [...new Set([...l.keys(), ...r.keys()])].sort()) {
      if (l.get(key) !== r.get(key)) diffs.push({ what: "read", key, values: [l.has(key) ? JSON.parse(l.get(key)!) : undefined, r.has(key) ? JSON.parse(r.get(key)!) : undefined] });
    }
  }
  return diffs;
}

const shown = (value: unknown): string => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text === undefined ? "(nothing)" : text.length > 80 ? `${text.slice(0, 77)}...` : text;
};

/** `mode`, comparing the two sides of `steps` (from {@link compareSteps}) as they play. */
export function comparing(mode: Mode, steps: readonly PlayStep[], compare: Compare): Mode {
  const sides = [...new Set(steps.map((s) => s.compareSide ?? ""))] as [string, string];
  // Which side each pane is on (a flow with panes has several a side).
  const sideOfPane = new Map(steps.map((s) => [paneName(s.block) ?? "", s.compareSide ?? ""]));
  const stopped = new Set<string>();
  const now = new Map<string, Side>();
  const found: { step: number; block: string; diffs: StepDiff[] }[] = [];
  let acting = "";
  // Each side's last step in the run log (its index there), for the differences to point at.
  const logged = new Map<string, number>();
  // What each side's page read after its step, and where it landed, from the run's own events.
  const off = onRunEvent((event) => {
    // A side's step starts afresh: what it reads is this step's.
    if (event.type === "step:start" && event.pane) {
      acting = sideOfPane.get(event.pane) ?? event.pane;
      if (event.parent === undefined) logged.set(acting, event.index);
      now.set(acting, { read: {} });
    }
    if (event.type === "step:read" && acting) now.set(acting, { ...(now.get(acting) ?? { read: {} }), read: event.read });
  });
  const side = (index: number) => steps[index]!.compareSide ?? "";
  /**
   * Both sides played step `index`'s step (it's the second side's, or the second side stopped and keeps what it was
   * left with): compare them.
   */
  const settle = (index: number) => {
    if (index % 2 === 0 && !stopped.has(sides[1])) return;
    const step = Math.floor(index / 2) + 1;
    const block = steps[index]!.block.name;
    // Signing in is setup (a kept session or a new one), not the scenario: not compared.
    if (block.startsWith("sign-in-as-")) return;
    const diffs = differences(now.get(sides[0]) ?? { read: {} }, now.get(sides[1]) ?? { read: {} });
    if (diffs.length) {
      found.push({ step, block, diffs });
      const at = sides.map((s) => logged.get(s));
      recordDiff(step, block, sides, diffs, at[0] !== undefined && at[1] !== undefined ? [at[0], at[1]] : undefined);
    }
  };
  return {
    ...mode,
    skip: (index) => stopped.has(side(index)),
    after: async (index, result, ms) => {
      now.set(side(index), { read: now.get(side(index))?.read ?? {}, landed: result.__state });
      await mode.after?.(index, result, ms);
      settle(index);
    },
    failed: async (index, failure, ms) => {
      await mode.failed?.(index, failure, ms);
      now.set(side(index), { read: {}, failed: failure.error ? messageOf(failure.error).split("\n")[0] ?? "failed" : `ended on ${failure.result?.__state}` });
      stopped.add(side(index));
      settle(index);
      // The other side plays on, unless it already stopped too.
      return stopped.size < 2 ? "continue" : "stop";
    },
    end: async (outcome) => {
      off();
      const label = `${compare.by} ${sides[0]} | ${sides[1]}`;
      if (!found.length) console.log(`waygraph compare (${label}): no differences`);
      else {
        console.log(`waygraph compare (${label}): ${found.length} step${found.length === 1 ? "" : "s"} differ`);
        for (const { step, block, diffs } of found) {
          for (const d of diffs) {
            const what = d.what === "read" ? d.key : d.what;
            console.log(`  step ${step} ${block}: ${what}: ${shown(d.values[0])} | ${shown(d.values[1])}`);
          }
        }
      }
      await mode.end?.(outcome);
    },
  };
}
