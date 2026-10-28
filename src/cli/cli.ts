#!/usr/bin/env node

/**
 * waygraph CLI -- tooling around this same package's engine.
 *
 * Primary verbs (less is more):
 *   auto   Explore picker; `.flow.ts` / `--blocks From To` = run that path
 *   demo   Watch (step overlay); `--blocks` `--data` `--auto-next` `--fast` `--full` `--mini` `--ff-expand` `--ff-disabled`
 *   run    Execute; `--blocks` `--data` `--non-headless` `--video`
 *   test   Runs the project's own @playwright/test suite; `test ui` / `--ui` = UI Mode
 *
 * Also: list / nav / validate / check / graph / init / agent-dive / traverse / try
 * Skills: --skill / --skill-pilot / --skill-pilot-blind / --skill-convention
 *
 * "project" defaults to cwd. Flags beat WAYGRAPH_* env.
 */

import { SKILL_FLAG_MAP, printSkillIndex, readSkillMarkdown } from "./commands/agent-dive-scaffold.js";
import type { SkillFlag } from "./commands/agent-dive-scaffold.js";
import { takeEnvFlag } from "../runtime/env-file.js";
import { takeConfigFlag } from "../runtime/waygraph-config.js";
import { usage } from "./usage.js";
import { setEnv } from "../engine/env.js";
// Each command is imported when it runs, not up front: some load Playwright, and a CLI that has loaded it can't then
// load a project's config whose own install brings a second copy (Playwright refuses two) - `waygraph try` does that.

const args = takeConfigFlag(takeEnvFlag(process.argv.slice(2)));
const command = args[0];
if (command) setEnv("WAYGRAPH_COMMAND", command);
async function main(): Promise<void> {
  if (!command || command === "--help" || command === "-h") {
    usage();
  }

  if (command === "--skill") {
    printSkillIndex();
    process.exit(0);
  }
  if (command && command in SKILL_FLAG_MAP) {
    const stem = SKILL_FLAG_MAP[command as SkillFlag];
    process.stdout.write(readSkillMarkdown(stem));
    process.exit(0);
  }

  switch (command) {
    case "list": await (await import("./commands/list.js")).listCase(args); break;

    case "nav": await (await import("./commands/list.js")).navCase(args); break;

    case "validate": await (await import("./commands/check.js")).validateCase(args); break;

    case "run": await (await import("./commands/run.js")).runCase(args); break;

    case "test": await (await import("./commands/test.js")).testCase(args); break;

    case "init": await (await import("./commands/init.js")).initCase(args); break;

    case "traverse": await (await import("./commands/traverse.js")).traverseCase(args); break;

    case "agent-dive":
    case "init-agents": await (await import("./commands/agent-dive.js")).agentDiveCase(args); break;

    case "demo": await (await import("./commands/run.js")).demoCase(args); break;

    case "graph":
    case "auto":
    case "browser":
    case "pilot": await (await import("./commands/session.js")).sessionCase(args, command); break;

    // Hidden: the detached server's own entry point, spawned by
    // `spawnDetachedSession` (auto --cli --detach). Not documented in
    // usage() - not meant to be invoked directly by a person.
    case "__auto-serve": await (await import("./commands/session.js")).autoServeCase(args); break;

    case "try": await (await import("./commands/try.js")).tryCase(args); break;

    case "typecheck": await (await import("./commands/check.js")).typecheckCase(args); break;

    case "check": await (await import("./commands/check.js")).checkCase(args); break;

    case "map": await (await import("./commands/map.js")).mapCase(args); break;

    case "upgrade": await (await import("./commands/upgrade.js")).upgradeCase(args); break;

    case "manifest": await (await import("./commands/manifest.js")).manifestCase(args); break;

    case "extensions": await (await import("./commands/extensions.js")).extensionsCase(args); break;

    default:
      console.error(`waygraph: unknown command "${command}"`);
      process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
