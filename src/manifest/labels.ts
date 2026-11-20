// A flow's labels, from the config's `labels`: each label names the flows it covers, by a glob over their files
// (`src/flows/auth/**`) or by a flow's export name (`loginFlow`).
import picomatch from "picomatch";
import { toPosix } from "./scan.js";

/** The config's labels: each one's patterns. */
export type Labels = Readonly<Record<string, readonly string[]>>;

/** Whether `pattern` names files (a path or a glob) rather than one flow by its export name. */
const isFilePattern = (pattern: string): boolean => /[/*?{[]/.test(pattern) || pattern.endsWith(".ts");

/** Whether `pattern` covers the flow exported as `exportName` from `file` (project-relative). */
function covers(pattern: string, file: string, exportName: string): boolean {
  return isFilePattern(pattern) ? picomatch.isMatch(toPosix(file), toPosix(pattern)) : pattern === exportName;
}

/** The labels of the flow exported as `exportName` from `file` (project-relative), in the config's order. */
export function labelsOf(labels: Labels | undefined, file: string, exportName: string): string[] {
  return Object.entries(labels ?? {})
    .filter(([, patterns]) => patterns.some((p) => covers(p, file, exportName)))
    .map(([label]) => label);
}

/** All of a flow's labels: the ones it names itself (`map({ labels })`), then the config's that cover it. */
export function flowLabels(own: readonly string[] | undefined, labels: Labels | undefined, file: string, exportName: string): string[] {
  return [...new Set([...(own ?? []), ...labelsOf(labels, file, exportName)])];
}

/** A label with more than its name: the flows it picks (globs over their files, or export names), and what it means. */
export interface LabelSpec<Label extends string = string> {
  name: Label;
  /** Flows this label puts its tag on, from the config: `"src/flows/auth/**"` or a flow's export name (`"logoutFlow"`). */
  flows?: readonly string[];
  /** What it means, in a line (shown by `waygraph info`). */
  description?: string;
}

/** The config's `labels` as written: names, and where a name needs more, a `{ name, … }` object. */
export type LabelsConfig<Label extends string = string> = readonly (Label | LabelSpec<Label>)[];

/** `labels` as names with the flows they pick (none for a plain name: the flows carry it themselves). */
export function normalizeLabels(labels: LabelsConfig | undefined): Labels {
  return Object.fromEntries((labels ?? []).map((label) => (typeof label === "string" ? [label, []] : [label.name, label.flows ?? []])));
}

/** Each label's description, where it has one. */
export function labelDescriptions(labels: LabelsConfig | undefined): Record<string, string> {
  return Object.fromEntries((labels ?? []).flatMap((label) => (typeof label !== "string" && label.description ? [[label.name, label.description]] : [])));
}

/** The declared labels that no flow carries (its own `map({ labels })`, or a config pattern covering it): a typo, or flows that moved. */
export function emptyLabels(labels: Labels | undefined, flows: readonly { labels: readonly string[] }[]): string[] {
  return Object.keys(labels ?? {}).filter((label) => !flows.some((f) => f.labels.includes(label)));
}
