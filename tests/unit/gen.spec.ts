import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { genCase } from "../../src/cli/commands/gen.js";
import { pageNames } from "../../src/cli/gen/names.js";

const here = process.cwd();
let dir = "";
const gen = async (...args: string[]) => {
  const log = console.log;
  console.log = () => undefined;
  try {
    await genCase(["gen", ...args]);
  } finally {
    console.log = log;
  }
};
const read = (...parts: string[]) => readFileSync(join(dir, ...parts), "utf8");
const start = () => {
  dir = mkdtempSync(join(tmpdir(), "wg-gen-"));
  process.chdir(dir);
};
afterEach(() => {
  process.chdir(here);
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = "";
});

describe("waygraph gen", () => {
  it("names a page from its path, the same way every time", () => {
    assert.deepEqual(pageNames("login"), { segments: ["login"], checkpoint: "Login", exportName: "LoginPage", selName: "LoginSel", blockName: "page-login", params: [] });
    assert.equal(pageNames("requests/[id]").checkpoint, "RequestsId");
    assert.equal(pageNames("(app)/docs/[id]/edit").params[0], "id");
    assert.equal(pageNames("requests/[id]", "RequestDetail").exportName, "RequestDetailPage");
  });

  it("writes a page with its selectors and one file per Method, and never overwrites", async () => {
    start();
    await gen("page", "login", "--read", "error", "--do", "fillEmail,submit");
    const page = read("src/map/(app_base)/login/_page.block.ts");
    assert.match(page, /checkpoint: "Login",\n {2}route: "folder",/);
    assert.match(page, /import \{ fillEmail \} from "\.\/_methods\/fill-email\.method\.block\.js";/);
    assert.match(page, /do: \(self\) => \(\{\n {4}fillEmail: fillEmail\(self\),\n {4}submit: submit\(self\),\n {2}\}\),/);
    assert.match(read("src/map/(app_base)/login/_methods/fill-email.method.block.ts"), /\(self: PageHandle<"Login">\)[\s\S]*\.fill\("TODO"\)/);
    assert.match(read("src/map/(app_base)/login/_methods/submit.method.block.ts"), /\.click\(\)/);
    assert.match(read("src/map/(app_base)/login/_sel.ts"), /heading: "TODO",\n {2}error: "TODO",\n {2}fillEmail: "TODO",/);
    // A second run leaves what is there alone, even edited.
    appendFileSync(join(dir, "src/map/(app_base)/login/_page.block.ts"), "// kept\n");
    await gen("page", "login");
    assert.equal(read("src/map/(app_base)/login/_page.block.ts"), `${page}// kept\n`);
  });

  it("adds a Method to a page: its file, its entry in do and its selector", async () => {
    start();
    await gen("page", "login", "--do", "submit");
    await gen("method", "login", "fillPassword");
    assert.match(read("src/map/(app_base)/login/_page.block.ts"), /submit: submit\(self\),\n {4}fillPassword: fillPassword\(self\),\n {2}\}\),/);
    assert.match(read("src/map/(app_base)/login/_page.block.ts"), /import \{ fillPassword \} from "\.\/_methods\/fill-password\.method\.block\.js";/);
    assert.match(read("src/map/(app_base)/login/_sel.ts"), /fillPassword: "TODO",\n\} as const;/);
    assert.ok(existsSync(join(dir, "src/map/(app_base)/login/_methods/fill-password.method.block.ts")));
  });

  it("writes a shell, keys and a flow; --dry writes nothing", async () => {
    start();
    await gen("page", "dashboard", "--shell");
    assert.match(read("src/map/(app_base)/dashboard/_page.block.ts"), /covers: "children",/);
    assert.doesNotMatch(read("src/map/(app_base)/dashboard/_page.block.ts"), /route:|expects:/);
    await gen("keys", "signup", "email,name");
    assert.match(read("src/states/signup.mem-keys.ts"), /keys\("signup"\)<\{\n {2}email: string;\n {2}name: string;\n\}>\(\);/);
    await gen("page", "x", "--dry");
    assert.equal(existsSync(join(dir, "src/map/(app_base)/x")), false);
  });
});
