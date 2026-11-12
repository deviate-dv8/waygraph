// How `waygraph gen` names things: the same input always gives the same names and files, so what an agent or a person
// generates matches what the next one does.

const words = (text: string): string[] => text.replace(/[\[\]]/g, " ").split(/[^A-Za-z0-9]+|(?<=[a-z0-9])(?=[A-Z])/).filter(Boolean);

export const pascal = (text: string): string => words(text).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
export const camel = (text: string): string => {
  const p = pascal(text);
  return p.charAt(0).toLowerCase() + p.slice(1);
};
export const kebab = (text: string): string => words(text).map((w) => w.toLowerCase()).join("-");

/** Everything a page's files are called, from its path under the map (`requests/[id]`). */
export interface PageNames {
  /** The folder segments as written, groups left out: `["requests", "[id]"]`. */
  segments: string[];
  /** Its Checkpoint (and the name `to:` and `covers:` use): `Login`, `RequestsId`. */
  checkpoint: string;
  /** Its export: `LoginPage`. */
  exportName: string;
  /** Its selector object: `LoginSel`. */
  selName: string;
  /** The Block's name: `page-login`. */
  blockName: string;
  /** A `[id]` in its path. */
  params: string[];
}

/** The names of the page at `path` (`login`, `requests/[id]`); `name` says the Checkpoint when the path's would be awkward. */
export function pageNames(path: string, name?: string): PageNames {
  const segments = path.split("/").filter((s) => s && !/^\(.*\)$/.test(s));
  const checkpoint = name ?? (pascal(segments.join(" ")) || "Home");
  return {
    segments,
    checkpoint,
    exportName: `${checkpoint}Page`,
    selName: `${checkpoint}Sel`,
    blockName: `page-${kebab(checkpoint)}`,
    params: segments.filter((s) => /^\[.+\]$/.test(s)).map((s) => s.slice(1, -1)),
  };
}

/** What an action called `key` does to its selector, by its name: `fill…` types, the rest click. */
export function actionOf(key: string): "fill" | "click" {
  return /^(fill|type|enter|set)/i.test(key) ? "fill" : "click";
}
