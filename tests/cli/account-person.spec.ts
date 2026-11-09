import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

// An account says who its person is (account(name, { signIn, mem })): its sign-in flow played on its own, and a flow as
// the account, sign in as that person with nothing given on the command line.
test.describe.configure({ mode: "serial" });

const exec = promisify(execFile);
const CLI = join(import.meta.dirname, "..", "..", "bin", "waygraph");
const dir = join(import.meta.dirname, ".tmp-account-person");
const { CHROME_PATH: _c, CHROMIUM_PATH: _cc, ...env } = process.env;

test.beforeAll(() => {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "src", "flows"), { recursive: true });
  writeFileSync(
    join(dir, "index.html"),
    `<input id="email"><button id="go" onclick="document.getElementById('who').textContent = 'Signed in as ' + document.getElementById('email').value">Sign in</button><p id="who"></p>`,
  );
  const url = pathToFileURL(join(dir, "index.html")).href;
  writeFileSync(
    join(dir, "src", "people.ts"),
    `import { checkpoint, defineMethodBlock, defineNavBlock, keys, Trait } from "waygraph";
export const People = keys("people")<{ email: string }>();
export const Login = checkpoint("Login");
export const Home = checkpoint("Home");
export const NavLogin = defineNavBlock({ name: "nav-login", checkpoint: Login, url: ${JSON.stringify(url)} });
export const SignIn = defineMethodBlock({
  name: "sign-in",
  from: Login,
  to: Home,
  requires: [People.email],
  instruction: {
    async act(page, _in, mem) {
      await page.locator("#email").fill(mem.get(People.email));
      await page.locator("#go").click();
    },
    verify: [Trait.contains("#who", (mem) => mem.get(People.email))],
  },
});
`,
  );
  // The sign-in flow's own file names no account: waygraph finds whose it is in src/accounts/.
  writeFileSync(
    join(dir, "src", "flows", "sign-in.flow.ts"),
    `import { map } from "waygraph";
import { NavLogin, SignIn } from "../people.js";
export const leadershipSignInFlow = map().gotoPage(NavLogin).method(SignIn);
`,
  );
  mkdirSync(join(dir, "src", "accounts"), { recursive: true });
  writeFileSync(
    join(dir, "src", "accounts", "accounts.ts"),
    `import { account } from "waygraph";
import { People } from "../people.js";
import { leadershipSignInFlow } from "../flows/sign-in.flow.js";
export const Leadership = account("leadership", {
  signIn: leadershipSignInFlow,
  mem: (m) => m.set(People.email, "cesar@example.test"),
});
`,
  );
  writeFileSync(
    join(dir, "src", "flows", "people.flow.ts"),
    `import { map } from "waygraph";
import { Leadership } from "../accounts/accounts.js";
export const asLeadershipFlow = map({ as: Leadership });
`,
  );
});
test.afterAll(() => rmSync(dir, { recursive: true, force: true }));

const signedInAs = (stdout: string) => {
  const log = /waygraph: run log (\S+)/.exec(stdout)![1]!;
  return readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.type === "run:mem").map((e) => e.values["people.email"]);
};

test("an account's sign-in flow, played on its own, signs in as its person", async () => {
  const { stdout } = await exec(process.execPath, [CLI, "run", "leadershipSignInFlow", dir], { env: { ...env, WAYGRAPH_HEADED: "0" } });
  expect(stdout).toMatch(/chain finished/);
  expect(signedInAs(stdout)).toEqual(["cesar@example.test"]);
});

test("a flow as the account signs in as its person: the sign-in's own check reads the email from mem", async () => {
  const { stdout } = await exec(process.execPath, [CLI, "run", "asLeadershipFlow", dir], { env: { ...env, WAYGRAPH_HEADED: "0" } });
  expect(stdout).toMatch(/chain finished/);
});
