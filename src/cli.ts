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
 * Aliases (one release): `chain` -> run/demo --blocks; `--autoplay` -> `--auto-next`
 *
 * "project" defaults to cwd. Flags beat WAYGRAPH_* env.
 */

import { SKILL_FLAG_MAP, printSkillIndex, readSkillMarkdown } from "./agent-dive.js";
import type { SkillFlag } from "./agent-dive.js";
import { usage } from "./cli/usage.js";
import { listCase, navCase } from "./commands/list.js";
import { checkCase, typecheckCase, validateCase } from "./commands/check.js";
import { chainCase, demoCase, runCase } from "./commands/run.js";
import { testCase } from "./commands/test.js";
import { initCase } from "./commands/init.js";
import { traverseCase } from "./commands/traverse.js";
import { agentDiveCase } from "./commands/agent-dive.js";
import { autoServeCase, sessionCase } from "./commands/session.js";
import { tryCase } from "./commands/try.js";
import { mapCase } from "./commands/map.js";

const args = process.argv.slice(2);
const command = args[0];
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
    case "list": await listCase(args); break;

    case "nav": await navCase(args); break;

    case "validate": await validateCase(args); break;

    case "run": await runCase(args); break;

    case "test": await testCase(args); break;

    case "init": await initCase(args); break;

    case "traverse": await traverseCase(args); break;

    case "agent-dive":
    case "init-agents": await agentDiveCase(args); break;

    case "chain": await chainCase(args); break;

    case "demo": await demoCase(args); break;

    case "graph":
    case "auto":
    case "browser":
    case "pilot": await sessionCase(args, command); break;

    // Hidden: the detached server's own entry point, spawned by
    // `spawnDetachedSession` (auto --cli --detach). Not documented in
    // usage() - not meant to be invoked directly by a person.
    case "__auto-serve": await autoServeCase(args); break;

    case "try": await tryCase(args); break;

    case "typecheck": await typecheckCase(args); break;

    case "check": await checkCase(args); break;

    case "map": await mapCase(args); break;

    default:
      console.error(`waygraph: unknown command "${command}"`);
      process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
