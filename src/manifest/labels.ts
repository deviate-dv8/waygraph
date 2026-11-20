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

/** The config's `labels` as written: a list of names, or an object that also picks flows (name: patterns). */
export type LabelsConfig<Label extends string = string> = readonly Label[] | Readonly<Record<Label, readonly string[]>>;

/** `labels` as names with their patterns: a list gives every name no patterns (the flows carry them themselves). */
export function normalizeLabels(labels: LabelsConfig | undefined): Labels {
  if (!labels) return {};
  return Array.isArray(labels) ? Object.fromEntries((labels as readonly string[]).map((name) => [name, []])) : (labels as Labels);
}

/** The declared labels that no flow carries (its own `map({ labels })`, or a config pattern covering it): a typo, or flows that moved. */
export function emptyLabels(labels: Labels | undefined, flows: readonly { labels: readonly string[] }[]): string[] {
  return Object.keys(labels ?? {}).filter((label) => !flows.some((f) => f.labels.includes(label)));
}
