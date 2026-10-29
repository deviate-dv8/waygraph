import { runAgentDive } from "./agent-dive-scaffold.js";
import type { AgentDiveLoop } from "./agent-dive-scaffold.js";
import { projectDirOf } from "../util.js";
import { helpLines, parseCommand } from "../args.js";
import type { OptionTable } from "../args.js";

const LOOPS: readonly string[] = ["claude", "opencode", "cursor", "vscode"];

const OPTIONS = {
  loop: { type: "string", value: "claude|opencode|cursor|vscode", help: "Which agent tool to write for (default claude)" },
  prompts: { type: "boolean", help: "Also copy docs/waygraph-agents/*.md" },
  help: { type: "boolean", help: "This help" },
} as const satisfies OptionTable;

export async function agentDiveCase(args: string[]): Promise<void> {
      // Playwright analogue: npx playwright init-agents --loop <provider>
      const { values, positionals } = parseCommand("agent-dive", OPTIONS, args.slice(1));
      if (values.help) {
        console.log(`waygraph agent-dive [--loop claude|opencode|cursor|vscode] [--prompts] [project]

Initialize coding-agent definitions for diving an app into waygraph Blocks
(Playwright \`init-agents\` analogue).

${helpLines(OPTIONS)}

  --loop claude writes .claude/agents/*.md, opencode .opencode/prompts/*.md,
  cursor .cursor/rules/waygraph-*.mdc, vscode .github/agents/*.md.

Agents shipped: waygraph-planner, waygraph-author, waygraph-healer.
`);
        process.exit(0);
      }
      const loop = (values.loop ?? "claude") as AgentDiveLoop;
      if (!LOOPS.includes(loop)) {
        console.error("waygraph agent-dive: --loop must be claude | opencode | cursor | vscode");
        process.exit(1);
      }
      const prompts = values.prompts === true;
      const projectDir = projectDirOf("agent-dive", positionals[0]);
      runAgentDive({ loop, projectDir, prompts });
      return;
}
