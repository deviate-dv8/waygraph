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
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export type AgentDiveLoop = "claude" | "opencode" | "cursor" | "vscode";

interface AgentSpec {
  name: string;
  description: string;
  model?: string;
  color?: string;
  tools: string[];
  instructions: string;
}

function packageRoot(): string {
  // dist/commands/agent-dive-scaffold.js -> ../..
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
}

function agentsTemplateDir(): string {
  return join(packageRoot(), "templates", "agents");
}

function skillsTemplateDir(): string {
  return join(packageRoot(), "templates", "skills");
}

/** A markdown file's YAML frontmatter (between the leading `---` lines) and its body. */
function readFrontmatter(filePath: string): { data: Record<string, unknown>; body: string } {
  const raw = readFileSync(filePath, "utf-8");
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) throw new Error(`agent-dive: missing or unclosed frontmatter in ${filePath}`);
  const data: unknown = parseYaml(m[1]!);
  if (data === null || typeof data !== "object" || Array.isArray(data)) throw new Error(`agent-dive: frontmatter in ${filePath} is not a mapping`);
  return { data: data as Record<string, unknown>, body: m[2]!.trim() };
}

/** Markdown with `data` as YAML frontmatter. */
function withFrontmatter(data: Record<string, unknown>, body: string): string {
  return `---\n${stringifyYaml(data, { lineWidth: 0 })}---\n\n${body}\n`;
}

function parseAgentSpec(filePath: string): AgentSpec {
  const { data, body } = readFrontmatter(filePath);
  const text = (k: string): string | undefined => (typeof data[k] === "string" && data[k] !== "" ? (data[k] as string) : undefined);
  const name = text("name") ?? basename(filePath).replace(/\.(agent|skill)\.md$/, "");
  const model = text("model");
  const color = text("color");
  return {
    name,
    description: text("description") ?? name,
    ...(model ? { model } : {}),
    ...(color ? { color } : {}),
    tools: Array.isArray(data.tools) ? data.tools.map(String) : [],
    instructions: body,
  };
}

function loadAgentSpecs(): AgentSpec[] {
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
function loadSkillSpecs(): AgentSpec[] {
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

/** Every packaged skill as `.agents/skills/<name>/SKILL.md` (relative path + markdown), the cross-agent skills folder. */
export function agentSkillFiles(): { rel: string; text: string }[] {
  return Object.values(SKILL_FLAG_MAP).map((stem) => ({
    rel: join(".agents", "skills", stem, "SKILL.md"),
    text: readSkillMarkdown(stem),
  }));
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
  return withFrontmatter(
    {
      name: agent.name,
      description: agent.description,
      ...(agent.model ? { model: agent.model } : {}),
      ...(agent.color ? { color: agent.color } : {}),
      ...(agent.tools.length ? { tools: agent.tools.join(", ") } : {}),
    },
    agent.instructions,
  );
}

function opencodePromptMd(agent: AgentSpec): string {
  return `${agent.instructions}\n`;
}

function cursorRuleMdc(agent: AgentSpec): string {
  return withFrontmatter({ description: agent.description, globs: null, alwaysApply: false }, `# ${agent.name}\n\n${agent.instructions}`);
}

function vscodeAgentMd(agent: AgentSpec): string {
  return claudeAgentMd(agent);
}

function claudeSkillMd(skill: AgentSpec): string {
  return withFrontmatter({ name: skill.name, description: skill.description }, skill.instructions);
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
