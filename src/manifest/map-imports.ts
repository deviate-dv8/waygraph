// The rule that makes a map group packable: its files import only waygraph, Playwright, `node:` modules and each other.
import { dirname, resolve, sep } from "node:path";
import { walkDir } from "./scan.js";
import { importSpecifiers, parseSource } from "./source.js";
import type { MapGroup } from "./maps.js";

export interface MapImportProblem {
  file: string;
  spec: string;
}

const ALLOWED_BARE = /^(waygraph|@playwright\/test|playwright|playwright-core)(\/.*)?$|^node:/;

/** Imports in a group that reach outside it. */
export function mapGroupImportProblems(group: MapGroup): MapImportProblem[] {
  const problems: MapImportProblem[] = [];
  for (const file of walkDir(group.dir, /\.ts$/)) {
    for (const spec of importSpecifiers(parseSource(file))) {
      if (spec.startsWith(".")) {
        const target = resolve(dirname(file), spec);
        if (target === group.dir || target.startsWith(group.dir + sep)) continue;
      } else if (ALLOWED_BARE.test(spec)) continue;
      problems.push({ file, spec });
    }
  }
  return problems;
}
