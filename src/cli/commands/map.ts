import { relative, resolve } from "node:path";
import { checkMap } from "../../analysis/map-check.js";
import { packMapGroup } from "../../manifest/pack.js";
import { parseCommand } from "../args.js";
import type { OptionTable } from "../args.js";

const PACK_OPTIONS = {
  out: { type: "string", value: "<dir>", help: "Output folder (default .waygraph/packages/<group>)" },
  name: { type: "string", value: "<package>", help: "Package name (default waygraph-map-<group>)" },
  version: { type: "string", value: "<x.y.z>", help: "Package version (default 0.1.0)" },
} as const satisfies OptionTable;

async function packCase(args: string[]): Promise<void> {
  const { values, positionals } = parseCommand("map pack", PACK_OPTIONS, args);
  const group = positionals[0];
  if (!group) {
    console.error("usage: waygraph map pack <group> [project] [--out <dir>] [--name <package>] [--version <x.y.z>]");
    process.exitCode = 1;
    return;
  }
  const proj = resolve(positionals[1] ?? process.cwd());
  const result = await packMapGroup(proj, group, { out: values.out, name: values.name, version: values.version });
  if (!result.ok) {
    console.error(`waygraph map pack: ${result.reason}`);
    for (const p of result.problems ?? []) console.error(`  ${relative(proj, p.file)} imports "${p.spec}"`);
    process.exitCode = 1;
    return;
  }
  console.log(`waygraph map pack: ${result.group} -> ${relative(proj, result.dir) || "."} (${result.name}, ${result.blocks} Blocks)`);
  console.log(`  publish: cd ${relative(process.cwd(), result.dir) || "."} && npm publish   install elsewhere: npm i ${result.name}`);
}

export async function mapCase(args: string[]): Promise<void> {
      if (args[1] === "pack") return packCase(args.slice(2));
      const proj = resolve(args[1] ?? process.cwd());
      const result = await checkMap(proj);
      if (!result.hasMapDir) {
        console.log(
          `waygraph map: no src/map/ directory under ${proj} - nothing to check ` +
            "(this project isn't on the Waygraph Map convention, or hasn't been migrated yet)",
        );
        return;
      }
      console.log(`waygraph map: ${result.nodes.length} node(s) found under ${relative(proj, result.mapRoot)}`);
      if (result.violations.length === 0) {
        console.log("waygraph map: 0 violations - every static Nav/Page url verbatim-matches its folder path");
      } else {
        for (const v of result.violations) {
          console.error(`waygraph map: ${v.file} (${v.block}) - ${v.reason}`);
        }
        console.error(
          `waygraph map: ${result.violations.length} violation${result.violations.length === 1 ? "" : "s"}`,
        );
        // Unlike `check`'s warnings-only stance, a Map violation is exactly
        // the class of bug this command exists to catch (a fabricated
        // folder grouping that never matched the real site, e.g. the real
        // (auth)/signin/ mistake this command's own header comment cites) -
        // fail loud, not just warn.
        process.exitCode = 1;
      }
      return;
}
