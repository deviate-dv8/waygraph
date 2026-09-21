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

function skillsTemplateDir(): string {
  return join(packageRoot(), "templates", "skills");
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

/**
 * Claude Code Skills (`.claude/skills/<name>/SKILL.md`) - a different
 * mechanism than the agent persona files above: loadable instructions
 * triggered by task shape, not a persona. Claude-Code-specific (no
 * equivalent in the opencode/cursor/vscode loops), additive to the
 * `claude` loop only. Reuses the same `name: .../description: ...` +
 * body frontmatter shape `parseAgentSpec` already parses.
 */
export function loadSkillSpecs(): AgentSpec[] {
  const dir = skillsTemplateDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".skill.md"))
    .sort()
    .map((f) => parseAgentSpec(join(dir, f)));
}

/** CLI flag -> packaged skill file stem (under templates/skills/). */
export const SKILL_FLAG_MAP = {
  "--skill-pilot": "waygraph-pilot",
  "--skill-pilot-blind": "waygraph-blind-pilot",
  "--skill-convention": "waygraph-convention",
} as const;

export type SkillFlag = keyof typeof SKILL_FLAG_MAP;

/** Raw skill markdown (frontmatter + body), as shipped in the package. */
export function readSkillMarkdown(stem: string): string {
  const path = join(skillsTemplateDir(), `${stem}.skill.md`);
  if (!existsSync(path)) {
    throw new Error(`waygraph: skill template missing at ${path}`);
  }
  const raw = readFileSync(path, "utf-8");
  return raw.endsWith("\n") ? raw : raw + "\n";
}

/** Print `--skill` index (available flags + one-line descriptions). */
export function printSkillIndex(): void {
  const skills = loadSkillSpecs();
  const byName = new Map(skills.map((s) => [s.name, s]));
  console.log("waygraph skills (print full text with the matching flag):\n");
  for (const [flag, stem] of Object.entries(SKILL_FLAG_MAP)) {
    const spec = byName.get(stem);
    const desc = spec?.description ?? stem;
    console.log(`  npx waygraph ${flag}`);
    console.log(`    ${desc}\n`);
  }
  console.log("Also: npx waygraph agent-dive --loop claude  # write .claude/skills/*/SKILL.md");
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

function claudeSkillMd(skill: AgentSpec): string {
  const lines = ["---", `name: ${skill.name}`, `description: ${skill.description}`, "---", "", skill.instructions, ""];
  return lines.join("\n");
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
      const skills = loadSkillSpecs();
      if (skills.length > 0) {
        console.log(`  ${skills.length} skill(s) from package templates`);
        const skillsRoot = join(root, ".claude", "skills");
        for (const s of skills) {
          writeFileLogged(join(skillsRoot, s.name, "SKILL.md"), claudeSkillMd(s), "claude skill");
        }
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
