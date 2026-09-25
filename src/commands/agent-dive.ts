// Split out of the former 8,700-line cli.ts (see src/ARCHITECTURE.md). Behavior unchanged.
import { runAgentDive } from "../agent-dive.js";
import type { AgentDiveLoop } from "../agent-dive.js";
import { resolve } from "node:path";
import { existsSync, statSync } from "node:fs";

export async function agentDiveCase(args: string[]): Promise<void> {
      // Playwright analogue: npx playwright init-agents --loop <provider>
      const rest = args.slice(1);
      let loop: AgentDiveLoop = "claude";
      let prompts = false;
      let projectDir = process.cwd();
      for (let i = 0; i < rest.length; i++) {
        const a = rest[i]!;
        if (a === "--prompts") {
          prompts = true;
          continue;
        }
        if (a === "--loop" || a.startsWith("--loop=")) {
          const v = a.startsWith("--loop=") ? a.slice("--loop=".length) : rest[++i];
          if (!v || !["claude", "opencode", "cursor", "vscode"].includes(v)) {
            console.error(
              "waygraph agent-dive: --loop must be claude | opencode | cursor | vscode",
            );
            process.exit(1);
          }
          loop = v as AgentDiveLoop;
          continue;
        }
        if (a === "--help" || a === "-h") {
          console.log(`waygraph agent-dive [--loop claude|opencode|cursor|vscode] [--prompts] [project]

Initialize coding-agent definitions for diving an app into waygraph Blocks
(Playwright \`init-agents\` analogue).

  --loop claude     write .claude/agents/*.md (default)
  --loop opencode   write .opencode/prompts/*.md
  --loop cursor     write .cursor/rules/waygraph-*.mdc
  --loop vscode     write .github/agents/*.md
  --prompts         also copy docs/waygraph-agents/*.md

Agents shipped: waygraph-planner, waygraph-author, waygraph-healer.
`);
          process.exit(0);
        }
        if (!a.startsWith("-")) {
          projectDir = resolve(a);
        }
      }
      if (!existsSync(projectDir) || !statSync(projectDir).isDirectory()) {
        console.error(`waygraph agent-dive: no such directory: ${projectDir}`);
        process.exit(1);
      }
      runAgentDive({ loop, projectDir, prompts });
      return;
}
