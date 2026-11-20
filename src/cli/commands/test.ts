import { configuredExtensions, loadWaygraphConfig } from "../../runtime/waygraph-config.js";
import { defaultRunLogDir, defaultSessionsDir } from "../../runtime/run-log.js";
import { runInherited } from "../util.js";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { regressionSets } from "../../manifest/regression.js";
import { walkDir } from "../../manifest/scan.js";
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

      // The tests are the project's flows (runtime/playwright-config.ts) unless it has none, `--specs` asks for its Playwright
      // spec files, or a spec file is named. `--flows` still says it outright.
      const flowsAt = rest.indexOf("--flows");
      if (flowsAt >= 0) rest.splice(flowsAt, 1);
      const specsAt = rest.indexOf("--specs");
      if (specsAt >= 0) rest.splice(specsAt, 1);
      const namesSpec = rest.some((a) => /\.(spec|test)\.[cm]?[jt]sx?$/.test(a));
      const playFlows = specsAt < 0 && !namesSpec && (flowsAt >= 0 || walkDir(proj, /\.flow\.ts$/).length > 0);
      if (playFlows) setEnv("WAYGRAPH_FLOW_TESTS", "1");
      // --regression <set>, --include a,b, --exclude c: which of the flows the full run plays (the config's `regression`).
      for (const [flag, name] of [["--regression", "WAYGRAPH_REGRESSION"], ["--include", "WAYGRAPH_INCLUDE"], ["--exclude", "WAYGRAPH_EXCLUDE"]] as const) {
        const value = takeOption(rest, [flag]);
        if (value !== undefined) setEnv(name, value);
      }
      const chosen = envString("WAYGRAPH_REGRESSION");
      if (chosen !== undefined) {
        const sets = Object.keys(regressionSets((await loadWaygraphConfig(proj))?.regression));
        if (!sets.includes(chosen)) {
          console.error(`waygraph test: --regression ${chosen} isn't a set of the config's regression (${sets.join(", ") || "none: regression in config/waygraph.config.ts"})`);
          process.exit(1);
        }
      }
      // --all: the full run plays every flow, whatever the regression set leaves out.
      const allAt = rest.indexOf("--all");
      if (allAt >= 0) {
        rest.splice(allAt, 1);
        setEnv("WAYGRAPH_ALL_FLOWS", "1");
      }
      // --label auth[,smoke]: only the flows with one of these labels (a flow's own `map({ labels })` or the config's; they are the tests' tags).
      const labelAt = rest.findIndex((a) => a === "--label" || a.startsWith("--label="));
      if (labelAt >= 0) {
        const given = rest[labelAt]!.includes("=") ? rest[labelAt]!.slice("--label=".length) : rest[labelAt + 1];
        rest.splice(labelAt, rest[labelAt]!.includes("=") ? 1 : 2);
        const wanted = (given ?? "").split(",").map((l) => l.trim()).filter(Boolean);
        if (!wanted.length) {
          console.error("waygraph test: --label needs a label (a flow's own, map({ labels }), or the config's); waygraph list shows each flow's");
          process.exit(1);
        }
        if (rest.includes("--grep") || rest.includes("-g")) {
          console.error("waygraph test: --label and --grep pick tests both ways; use one");
          process.exit(1);
        }
        rest.push("--grep", wanted.map((l) => `@${l}\\b`).join("|"));
      }
      // Playing flows, the filters go on the flows projects (runtime/playwright-config.ts), not the command line: the
      // exclusive flows' project depends on the rest, and Playwright runs a dependency unfiltered.
      if (playFlows) {
        const grep = takeOption(rest, ["--grep", "-g"]);
        const grepInvert = takeOption(rest, ["--grep-invert"]);
        if (grep !== undefined) setEnv("WAYGRAPH_TEST_GREP", grep);
        if (grepInvert !== undefined) setEnv("WAYGRAPH_TEST_GREP_INVERT", grepInvert);
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

/** Takes `--name value` or `--name=value` (any of `names`) out of `args`, and returns its value. */
function takeOption(args: string[], names: readonly string[]): string | undefined {
  const at = args.findIndex((a) => names.includes(a) || names.some((n) => a.startsWith(`${n}=`)));
  if (at < 0) return undefined;
  const arg = args[at]!;
  const eq = arg.indexOf("=");
  if (eq >= 0) {
    args.splice(at, 1);
    return arg.slice(eq + 1);
  }
  const value = args[at + 1];
  args.splice(at, 2);
  return value;
}
