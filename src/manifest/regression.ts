// The full run's filter (`regression` in the config): which flows it plays, by the labels they carry. Every flow runs unless
// a set says otherwise: `include` keeps only flows with one of its labels, then `exclude` drops flows with one of its.
import type { Labels } from "./labels.js";

/** One set of labels. `include`: only flows carrying one of them; `exclude`: not the flows carrying one of them (it wins). */
export interface RegressionSet<Label extends string = string> {
  include?: readonly NoInfer<Label>[];
  exclude?: readonly NoInfer<Label>[];
}

/** The config's `regression`: one set, or several named ones (`default` is the one a bare run uses). */
export type RegressionConfig<Label extends string = string> = RegressionSet<Label> | Record<string, RegressionSet<Label>>;

const isSet = (config: RegressionConfig): config is RegressionSet => Object.keys(config).every((key) => key === "include" || key === "exclude");

/** The named sets of a config's `regression`: a lone set is `default`. */
export function regressionSets(config: RegressionConfig | undefined): Record<string, RegressionSet> {
  if (!config) return {};
  return isSet(config) ? { default: config } : (config as Record<string, RegressionSet>);
}

/** What one run's `--include` / `--exclude` say: they replace the chosen set's own lists. */
export interface AdHoc {
  include?: readonly string[] | undefined;
  exclude?: readonly string[] | undefined;
}

/** The set a run uses: the named one (`--regression`; `default` when none), with `--include` / `--exclude` over it. Throws on a name the config lacks. */
export function chooseSet(config: RegressionConfig | undefined, name?: string, adhoc: AdHoc = {}): RegressionSet | undefined {
  const sets = regressionSets(config);
  if (name !== undefined && !(name in sets)) {
    throw new Error(`--regression ${name} isn't a set of the config's regression (${Object.keys(sets).join(", ") || "none"})`);
  }
  const base = sets[name ?? "default"];
  if (!base && !adhoc.include?.length && !adhoc.exclude?.length) return undefined;
  return {
    ...(adhoc.include?.length ? { include: adhoc.include } : base?.include ? { include: base.include } : {}),
    ...(adhoc.exclude?.length ? { exclude: adhoc.exclude } : base?.exclude ? { exclude: base.exclude } : {}),
  };
}

/** Why a flow carrying `own` labels isn't in the set's run, or undefined when it is. */
export function leftOutOf(set: RegressionSet | undefined, own: readonly string[]): string | undefined {
  if (!set) return undefined;
  const hit = own.filter((label) => set.exclude?.includes(label));
  if (hit.length) return hit.join(", ");
  if (set.include?.length && !own.some((label) => set.include?.includes(label))) return `not in ${set.include.join(", ")}`;
  return undefined;
}

/** A label named by a set that no config label or flow carries: a typo, or flows that moved. */
export function unknownInSets(config: RegressionConfig | undefined, labels: Labels | undefined, flows: readonly { labels: readonly string[] }[]): { set: string; label: string }[] {
  const known = (label: string) => label in (labels ?? {}) || flows.some((f) => f.labels.includes(label));
  return Object.entries(regressionSets(config)).flatMap(([set, lists]) => [...(lists.include ?? []), ...(lists.exclude ?? [])].filter((label) => !known(label)).map((label) => ({ set, label })));
}
