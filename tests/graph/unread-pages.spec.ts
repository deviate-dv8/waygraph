import { test, expect } from "@playwright/test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { checkProject } from "../../src/analysis/check.js";

/** `waygraph check` lists pages (where a Nav / Page Block lands) that no Read Block reads. */
test.describe("pages without a Read Block", () => {
  const dir = join(import.meta.dirname, ".tmp-unread-pages");
  test.beforeAll(async () => {
    await mkdir(join(dir, "src/map/home"), { recursive: true });
    await mkdir(join(dir, "src/map/docs"), { recursive: true });
    await writeFile(join(dir, "src/map/states.ts"), `import { checkpoint } from "waygraph";\nexport const Home = checkpoint("Home");\nexport const Docs = checkpoint("Docs");`);
    await writeFile(join(dir, "src/map/home/_nav.block.ts"), `import { defineNavBlock } from "waygraph";\nimport { Home } from "../states.js";\nexport const NavHome = defineNavBlock({ name: "nav-home", checkpoint: Home, url: "/" });`);
    await writeFile(join(dir, "src/map/docs/_nav.block.ts"), `import { defineNavBlock } from "waygraph";\nimport { Docs } from "../states.js";\nexport const NavDocs = defineNavBlock({ name: "nav-docs", checkpoint: Docs, url: "/docs" });`);
    await writeFile(
      join(dir, "src/map/home/_read.block.ts"),
      `import { defineReadBlock, reads } from "waygraph";\nimport { Home } from "../states.js";\nconst HomeRead = reads("home")<{ title: string }>();\nexport const HomeReadBlock = defineReadBlock({ name: "read-home", from: [Home], instruction: { read: (ctx) => HomeRead({ title: ctx.page.text("h1") }) } });`,
    );
  });
  test.afterAll(() => rm(dir, { recursive: true, force: true }));

  test("only the page nothing reads", async () => {
    const { unreadPages } = await checkProject(dir, { noPractices: true });
    expect(unreadPages.map((p) => [p.checkpoint, p.file.endsWith("docs/_nav.block.ts")])).toEqual([["Docs", true]]);
  });
});
