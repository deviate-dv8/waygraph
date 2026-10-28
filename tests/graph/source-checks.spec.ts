import { test, expect } from "@playwright/test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { checkProject } from "../../src/analysis/check.js";
import { collectKnownInteractionSelectors } from "../../src/analysis/coverage-gap.js";

const block = (name: string, body: string) => `
import { defineMethodBlock, checkpoint } from "waygraph";
${body}
export const ${name} = defineMethodBlock({
  name: "${name}",
  to: checkpoint("Done"),
  instruction: { async act({ page }) { await page.locator("#user-name").fill("x"); }, resolve: () => checkpoint("Done") },
});
`;

test.describe("source checks read the AST, not the file text", () => {
  test.describe.configure({ mode: "serial" });
  const dir = join(import.meta.dirname, ".tmp-source-checks");
  test.beforeAll(async () => {
    await mkdir(join(dir, "src/blocks"), { recursive: true });
    await writeFile(join(dir, "src/blocks/comment.block.ts"), block("CommentBlock", `// never page.goto("/") in here\nconst note = "page.goto(";`));
    await writeFile(join(dir, "src/blocks/navigates.block.ts"), block("NavigatesBlock", `export const go = async (page: { goto(u: string): Promise<unknown> }) => page.goto("/");`));
    await writeFile(join(dir, "src/blocks/styled.sel.ts"), `export const StyledSel = { button: "[data-test=save]", color: "#fde68a" };`);
    await mkdir(join(dir, "src/map/(app)/home"), { recursive: true });
    await writeFile(join(dir, "src/map/(app)/home/_sel.ts"), "export const HomeSel = { clear: \"[data-test=clear]\", add: (id: string) => `[data-test=add-${id}]`, row: (id: string) => `#row-${id}` };");
  });
  test.afterAll(() => rm(dir, { recursive: true, force: true }));

  test("page.goto in a comment or a string is not navigation; a real call is", async () => {
    const { navWarnings } = await checkProject(dir, { noPractices: true });
    expect(navWarnings.map((w) => w.exportName)).toEqual(["NavigatesBlock"]);
  });

  test("selectors come from string literals; a colour is not a selector", () => {
    const known = collectKnownInteractionSelectors(dir, { navBlocks: [] });
    expect(known).toContain("#user-name");
    expect(known).toContain("[data-test=save]");
    expect(known).not.toContain("#fde68a");
  });

  test("a Map page's _sel.ts counts; a selector built per row matches every row", () => {
    const known = collectKnownInteractionSelectors(dir, { navBlocks: [] });
    expect(known).toContain("[data-test=clear]");
    expect(known).toContain('[data-test^="add-"]');
    expect(known).toContain('[id^="row-"]');
  });
});
