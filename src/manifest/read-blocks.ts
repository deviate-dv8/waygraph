// Loads a project's Read Blocks (`*.read.block.ts`, its own and its installed map packages'): importing one registers it,
// so every run can read the pages it lands on. Sessions get them from the full project scan; a run by flow name does not.
import { relative } from "node:path";
import { pathToFileURL } from "node:url";
import { installedMapPackages, mapPackageBlockFiles } from "./maps.js";
import { reportImportError } from "./project.js";
import { walkDir } from "./scan.js";

const READ_BLOCK = /\.read\.block\.ts$/;

/** Imports every Read Block file of the project; returns how many loaded. */
export async function loadReadBlocks(projectDir: string): Promise<number> {
  const files = [...walkDir(projectDir, READ_BLOCK), ...installedMapPackages(projectDir).flatMap(mapPackageBlockFiles).filter((f) => READ_BLOCK.test(f))];
  let loaded = 0;
  for (const file of files) {
    try {
      await import(pathToFileURL(file).href);
      loaded += 1;
    } catch (err) {
      reportImportError(relative(projectDir, file), err);
    }
  }
  return loaded;
}
