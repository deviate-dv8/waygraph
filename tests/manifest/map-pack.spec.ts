import { test, expect } from "@playwright/test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { packMapGroup } from "../../src/manifest/pack.js";
import { buildManifest } from "../../src/manifest/manifest.js";
import { checkMapGroups } from "../../src/analysis/check.js";

const repo = join(import.meta.dirname, "../..");

function write(root: string, files: Record<string, string>): void {
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
}

function linkDeps(root: string, names: string[]): void {
  mkdirSync(join(root, "node_modules"), { recursive: true });
  for (const n of names) symlinkSync(n === "waygraph" ? repo : join(repo, "node_modules", n), join(root, "node_modules", n));
}

const GROUP = "src/map/(external)/echo";

test("a map group packs into a package another project picks up", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wg-pack-"));
  try {
    const app = join(dir, "app");
    write(app, {
      "package.json": JSON.stringify({ name: "app", type: "module" }),
      "tsconfig.json": JSON.stringify({
        compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, skipLibCheck: true },
        include: ["src/**/*.ts"],
      }),
      [`${GROUP}/_states.ts`]: 'import { checkpoint } from "waygraph";\nexport const EchoReady = checkpoint("EchoReady");\nexport type EchoReady = typeof EchoReady;\nexport const EchoDone = checkpoint("EchoDone");\nexport type EchoDone = typeof EchoDone;\n',
      [`${GROUP}/_keys.ts`]: 'import { key } from "waygraph";\nexport const Message = key<string>("echo.message");\n',
      [`${GROUP}/_methods/send.method.block.ts`]:
        'import { defineMethodBlock } from "waygraph";\nimport { EchoReady, EchoDone } from "../_states.js";\nimport { Message } from "../_keys.js";\n' +
        'export const SendBlock = defineMethodBlock({ name: "echo-send", from: EchoReady, to: EchoDone, requires: [Message], instruction: { async act() {} } });\n',
    });
    linkDeps(app, ["waygraph", "typescript"]);
    expect(checkMapGroups(app)).toEqual([]);

    const packed = await packMapGroup(app, "echo");
    expect(packed).toMatchObject({ ok: true, name: "waygraph-map-echo", group: "(external)/echo", blocks: 1 });
    if (!packed.ok) return;
    const map = JSON.parse(readFileSync(join(packed.dir, "waygraph.map.json"), "utf8"));
    expect(map.blocks).toEqual([
      { name: "echo-send", exportName: "SendBlock", kind: "method", from: ["EchoReady"], to: ["EchoDone"], requires: ["echo.message"], file: "_methods/send.method.block.js" },
    ]);
    expect(readFileSync(join(packed.dir, "index.d.ts"), "utf8")).toContain('export * from "./_methods/send.method.block.js";');

    const consumer = join(dir, "consumer");
    write(consumer, { "package.json": JSON.stringify({ name: "consumer", type: "module", dependencies: { "waygraph-map-echo": "0.1.0" } }) });
    linkDeps(consumer, ["waygraph"]);
    cpSync(packed.dir, join(consumer, "node_modules", "waygraph-map-echo"), { recursive: true });
    const m = await buildManifest(consumer);
    expect(m.maps).toEqual(["waygraph-map-echo"]);
    expect(m.blocks.map((b) => [b.name, b.file, b.from, b.to])).toEqual([
      ["echo-send", "waygraph-map-echo/_methods/send.method.block.js", ["EchoReady"], ["EchoDone"]],
    ]);

    write(app, { [`${GROUP}/_methods/leak.method.block.ts`]: 'import "../../../../states/app.js";\n' });
    expect(checkMapGroups(app).map((p) => p.spec)).toEqual(["../../../../states/app.js"]);
    expect(await packMapGroup(app, "echo")).toMatchObject({ ok: false });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
