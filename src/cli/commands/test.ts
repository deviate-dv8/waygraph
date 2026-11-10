import { configuredExtensions, loadWaygraphConfig } from "../../runtime/waygraph-config.js";
import { defaultRunLogDir, defaultSessionsDir } from "../../runtime/run-log.js";
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

      // --flows: the tests are the project's flows (runtime/playwright-config.ts), not its spec files.
      const flowsAt = rest.indexOf("--flows");
      if (flowsAt >= 0) {
        rest.splice(flowsAt, 1);
        setEnv("WAYGRAPH_FLOW_TESTS", "1");
      }
      // --label auth[,smoke]: only the flows with one of these labels (the config's labels, as the tests' tags).
      const labelAt = rest.findIndex((a) => a === "--label" || a.startsWith("--label="));
      if (labelAt >= 0) {
        const given = rest[labelAt]!.includes("=") ? rest[labelAt]!.slice("--label=".length) : rest[labelAt + 1];
        rest.splice(labelAt, rest[labelAt]!.includes("=") ? 1 : 2);
        const known = Object.keys((await loadWaygraphConfig(proj))?.labels ?? {});
        const wanted = (given ?? "").split(",").map((l) => l.trim()).filter(Boolean);
        const unknown = wanted.filter((l) => !known.includes(l));
        if (!wanted.length || unknown.length) {
          console.error(`waygraph test: --label ${unknown.length ? `${unknown.join(", ")} isn't a label` : "needs a label"}; the config's labels: ${known.join(", ") || "none (labels in config/waygraph.config.ts)"}`);
          process.exit(1);
        }
        if (rest.includes("--grep") || rest.includes("-g")) {
          console.error("waygraph test: --label and --grep pick tests both ways; use one");
          process.exit(1);
        }
        rest.push("--grep", wanted.map((l) => `@${l}\\b`).join("|"));
      }
      // --fresh-sessions: every account signs in again (its saved session isn't used), and saves the new one.
      const freshAt = rest.indexOf("--fresh-sessions");
      if (freshAt >= 0) {
        rest.splice(freshAt, 1);
        setEnv("WAYGRAPH_FRESH_SESSIONS", "1");
      }
      const extensions = await configuredExtensions(proj);
      if (envString("WAYGRAPH_RUN_LOG") === undefined) setEnv("WAYGRAPH_RUN_LOG", defaultRunLogDir(proj));
      if (envString("WAYGRAPH_SESSIONS") === undefined) setEnv("WAYGRAPH_SESSIONS", defaultSessionsDir(proj));
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
