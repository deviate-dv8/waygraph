// Split out of the former 8,700-line cli.ts (see src/ARCHITECTURE.md). Behavior unchanged.
import { relative, resolve } from "node:path";
import { checkMap } from "../map-check.js";

export async function mapCase(args: string[]): Promise<void> {
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
