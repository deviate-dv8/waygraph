import { configuredExtensions } from "../../runtime/config.js";
import { defaultRunLogDir } from "../../runtime/run-log.js";
import { runInherited } from "../util.js";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { packageRoot } from "../util.js";
import { envString, setEnv } from "../../engine/env.js";

export async function testCase(args: string[]): Promise<void> {
      const rest = args.slice(1);
      const proj = process.cwd();
      const localPlaywrightBin = join(proj, "node_modules", ".bin", "playwright");
      const runPw = (pwArgs: string[]) =>
        existsSync(localPlaywrightBin)
          ? runInherited(localPlaywrightBin, pwArgs, proj)
          : runInherited("npx", ["--yes", "playwright", ...pwArgs], proj);

      // report/show-trace are separate top-level `playwright` commands, not
      // `playwright test` subcommands - handled before the `test` forward below.
      if (rest[0] === "report") {
        process.exitCode = await runPw(["show-report", ...rest.slice(1)]);
        return;
      }
      if (rest[0] === "show-trace") {
        if (!rest[1]) {
          console.error("waygraph test show-trace: missing <trace.zip> (or a test-results/ dir)");
          process.exit(1);
        }
        process.exitCode = await runPw(["show-trace", ...rest.slice(1)]);
        return;
      }

      const extensions = await configuredExtensions(proj);
      if (envString("WAYGRAPH_RUN_LOG") === undefined) setEnv("WAYGRAPH_RUN_LOG", defaultRunLogDir(proj));
      if (extensions.length > 0) setEnv("WAYGRAPH_EXTENSIONS", extensions.join(","));

      // The Playwright config is built from config/waygraph.config.ts; a project has none of its own.
      setEnv("WAYGRAPH_PROJECT_DIR", proj);
      const configArgs = ["-c", join(packageRoot(), "dist", "runtime", "playwright.config.js")];

      const wantsUi = rest[0] === "ui" || rest.includes("--ui");
      const forwarded = rest[0] === "ui" ? rest.slice(1) : rest;
      const pwArgs =
        wantsUi && !forwarded.includes("--ui")
          ? ["test", ...configArgs, "--ui", ...forwarded]
          : ["test", ...configArgs, ...forwarded];
      process.exitCode = await runPw(pwArgs);
      return;
}
