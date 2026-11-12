import { test, expect } from "@playwright/test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = join(import.meta.dirname, ".tmp-folder-route");
test.afterAll(() => rm(dir, { recursive: true, force: true }));

test("route: 'folder' gives a page the address of its folder under src/map", async () => {
  const folder = join(dir, "src", "map", "(app)", "requests", "[id]", "_private");
  await mkdir(folder, { recursive: true });
  const src = join(import.meta.dirname, "..", "..", "src", "index.ts");
  await writeFile(
    join(dir, "src", "map", "(app)", "requests", "[id]", "_page.block.ts"),
    `import { checkpoint, definePageBlock } from ${JSON.stringify(pathToFileURL(src).href)};
export const Detail = definePageBlock({ name: "page-folder-detail", checkpoint: checkpoint("FolderDetail"), route: "folder" });
`,
  );
  const mod = (await import(pathToFileURL(join(dir, "src", "map", "(app)", "requests", "[id]", "_page.block.ts")).href)) as {
    Detail: { __waygraphNavUrl: string; go: (p: Record<string, string | number>) => { __waygraphNavUrl: string } };
  };
  expect(mod.Detail.__waygraphNavUrl).toBe("/requests/[id]");
  expect(mod.Detail.go({ id: 9 }).__waygraphNavUrl).toBe("/requests/9");
});
