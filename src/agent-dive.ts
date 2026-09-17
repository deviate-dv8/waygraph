/**
 * `waygraph agent-dive` — initialize coding-agent definitions for diving an app
 * into waygraph Blocks (Playwright `init-agents` analogue).
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type AgentDiveLoop = "claude" | "opencode" | "cursor" | "vscode";

export interface AgentSpec {
  name: string;
  description: string;
  model?: string;
  color?: string;
  tools: string[];
  instructions: string;
}

function packageRoot(): string {
  // dist/agent-dive.js -> ..
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

function agentsTemplateDir(): string {
  return join(packageRoot(), "templates", "agents");
}

/** Minimal YAML-ish frontmatter parser for `*.agent.md` templates. */
export function parseAgentSpec(filePath: string): AgentSpec {
  const raw = readFileSync(filePath, "utf-8");
  if (!raw.startsWith("---\n")) {
    throw new Error(`agent-dive: missing frontmatter in ${filePath}`);
  }
  const end = raw.indexOf("\n---\n", 4);
  if (end < 0) throw new Error(`agent-dive: unclosed frontmatter in ${filePath}`);
  const fm = raw.slice(4, end);
  const body = raw.slice(end + 5).trim();

  const meta: Record<string, string> = {};
  let listKey: string | null = null;
  const lists: Record<string, string[]> = {};

  for (const line of fm.split("\n")) {
    if (/^\s+-\s+/.test(line) && listKey) {
      lists[listKey]!.push(line.replace(/^\s+-\s+/, "").trim());
      continue;
    }
    listKey = null;
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1]!;
    const val = m[2]!.trim();
    if (val === "") {
      listKey = key;
      lists[key] = [];
    } else {
      meta[key] = val;
    }
  }

  const name = meta.name || basename(filePath).replace(/\.agent\.md$/, "");
  return {
    name,
    description: meta.description || name,
    ...(meta.model ? { model: meta.model } : {}),
    ...(meta.color ? { color: meta.color } : {}),
    tools: lists.tools ?? [],
    instructions: body,
  };
}

export function loadAgentSpecs(): AgentSpec[] {
  const dir = agentsTemplateDir();
  if (!existsSync(dir)) {
    throw new Error(`agent-dive: templates missing at ${dir}`);
  }
  return readdirSync(dir)
    .filter((f) => f.endsWith(".agent.md"))
    .sort()
    .map((f) => parseAgentSpec(join(dir, f)));
}

function writeFileLogged(path: string, content: string, kind: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content.endsWith("\n") ? content : content + "\n");
  console.log(`  wrote ${path} (${kind})`);
}

function claudeAgentMd(agent: AgentSpec): string {
  const tools = agent.tools.join(", ");
  const lines = [
    "---",
    `name: ${agent.name}`,
    `description: ${agent.description}`,
    ...(agent.model ? [`model: ${agent.model}`] : []),
    ...(agent.color ? [`color: ${agent.color}`] : []),
    ...(tools ? [`tools: ${tools}`] : []),
    "---",
    "",
    agent.instructions,
    "",
  ];
  return lines.join("\n");
}

function opencodePromptMd(agent: AgentSpec): string {
  return `${agent.instructions}\n`;
}

function cursorRuleMdc(agent: AgentSpec): string {
  return `---
description: ${agent.description}
globs:
alwaysApply: false
---

# ${agent.name}

${agent.instructions}
`;
}

function vscodeAgentMd(agent: AgentSpec): string {
  return claudeAgentMd(agent);
}

export interface AgentDiveOptions {
  loop: AgentDiveLoop;
  projectDir: string;
  /** Also copy raw prompts under docs/waygraph-agents/ */
  prompts?: boolean;
}

export function runAgentDive(opts: AgentDiveOptions): void {
  const agents = loadAgentSpecs();
  const root = opts.projectDir;
  console.log(`waygraph agent-dive (${opts.loop}) -> ${root}`);
  console.log(`  ${agents.length} agent(s) from package templates`);

  switch (opts.loop) {
    case "claude": {
      const dir = join(root, ".claude", "agents");
      mkdirSync(dir, { recursive: true });
      for (const a of agents) {
        writeFileLogged(join(dir, `${a.name}.md`), claudeAgentMd(a), "claude agent");
      }
      break;
    }
    case "opencode": {
      const dir = join(root, ".opencode", "prompts");
      mkdirSync(dir, { recursive: true });
      for (const a of agents) {
        writeFileLogged(join(dir, `${a.name}.md`), opencodePromptMd(a), "opencode prompt");
      }
      break;
    }
    case "cursor": {
      const dir = join(root, ".cursor", "rules");
      mkdirSync(dir, { recursive: true });
      for (const a of agents) {
        writeFileLogged(join(dir, `${a.name}.mdc`), cursorRuleMdc(a), "cursor rule");
      }
      break;
    }
    case "vscode": {
      const dir = join(root, ".github", "agents");
      mkdirSync(dir, { recursive: true });
      for (const a of agents) {
        writeFileLogged(join(dir, `${a.name}.md`), vscodeAgentMd(a), "vscode agent");
      }
      break;
    }
    default: {
      const _exhaustive: never = opts.loop;
      throw new Error(`agent-dive: unsupported loop ${_exhaustive}`);
    }
  }

  if (opts.prompts) {
    const dir = join(root, "docs", "waygraph-agents");
    mkdirSync(dir, { recursive: true });
    for (const a of agents) {
      writeFileLogged(
        join(dir, `${a.name}.md`),
        `# ${a.name}\n\n${a.description}\n\n${a.instructions}\n`,
        "prompt copy",
      );
    }
  }

  console.log("");
  console.log("Next: point your coding agent at those files, then:");
  console.log("  npx waygraph check .");
  console.log("  npx waygraph auto --cli");
  console.log("  (scaffold: npx waygraph init my-app)");
}
