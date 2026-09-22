import { test, expect } from "@playwright/test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAgentDive } from "../../src/agent-dive.js";

test.describe("agent-dive: Claude Code Skills generation", () => {
  test("claude loop writes real SKILL.md files for both waygraph skills", async () => {
    const dir = await mkdtemp(join(tmpdir(), "waygraph-agent-dive-"));
    try {
      runAgentDive({ loop: "claude", projectDir: dir });

      const pilotSkill = await readFile(join(dir, ".claude/skills/waygraph-pilot/SKILL.md"), "utf-8");
      expect(pilotSkill).toMatch(/^---\nname: waygraph-pilot\ndescription: /);
      expect(pilotSkill).toContain("resync");
      expect(pilotSkill).toContain("auto highlight");
      expect(pilotSkill).toMatch(/Pilot supports them|Yes, Pilot paints/i);

      const blindPilotSkill = await readFile(
        join(dir, ".claude/skills/waygraph-blind-pilot/SKILL.md"),
        "utf-8",
      );
      expect(blindPilotSkill).toMatch(/^---\nname: waygraph-blind-pilot\ndescription: /);
      expect(blindPilotSkill).toContain("auto reload");

      const conventionSkill = await readFile(
        join(dir, ".claude/skills/waygraph-convention/SKILL.md"),
        "utf-8",
      );
      expect(conventionSkill).toMatch(/^---\nname: waygraph-convention\ndescription: /);
      expect(conventionSkill).toContain("One distinct action per Block");

      // Agent personas still get written too - additive, not a replacement.
      const authorAgent = await readFile(join(dir, ".claude/agents/waygraph-author.md"), "utf-8");
      expect(authorAgent).toContain("name: waygraph-author");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("non-claude loops never write .claude/skills - Skills are Claude-Code-specific", async () => {
    const dir = await mkdtemp(join(tmpdir(), "waygraph-agent-dive-cursor-"));
    try {
      runAgentDive({ loop: "cursor", projectDir: dir });
      await expect(readFile(join(dir, ".claude/skills/waygraph-pilot/SKILL.md"), "utf-8")).rejects.toThrow();
      const rule = await readFile(join(dir, ".cursor/rules/waygraph-author.mdc"), "utf-8");
      expect(rule).toContain("waygraph-author");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
