/**
 * Headless runtime proof: wrong password -> LoginPage + error banner.
 * Prints PASS/FAIL to stdout only (no screenshots, no visible browser).
 */
import { chromium } from "@playwright/test";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
await import(require.resolve("tsx/esm"));

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const waygraphDist = join(root, "../../dist");
const { Engine, start, end, MemPage } = await import(pathToFileURL(join(waygraphDist, "index.js")).href);
const { NavLoginBlock } = await import(pathToFileURL(join(root, "src/blocks/saucedemo-web/nav-login.block.js")).href);
const { FillUsernameBlock } = await import(
  pathToFileURL(join(root, "src/blocks/saucedemo-web/methods/fill-username.method.block.js")).href
);
const { FillPasswordBlock } = await import(
  pathToFileURL(join(root, "src/blocks/saucedemo-web/methods/fill-password.method.block.js")).href
);
const { SubmitLoginBlock } = await import(
  pathToFileURL(join(root, "src/blocks/saucedemo-web/methods/submit-login.method.block.js")).href
);
const { LoginCreds } = await import(pathToFileURL(join(root, "src/states/checkout.mem-keys.js")).href);

const exe = process.env.CHROME_PATH || process.env.CHROMIUM_PATH;
const baseURL = "https://www.saucedemo.com";

console.log("RUNTIME: headless browser (wrong password test)...");
console.log("RUNTIME: baseURL =", baseURL);

const browser = await chromium.launch({
  headless: true,
  ...(exe ? { executablePath: exe, args: ["--no-sandbox", "--disable-dev-shm-usage"] } : {}),
});
const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const engine = new Engine({ headless: true });
const mem = new MemPage();
mem.set(LoginCreds({ username: "standard_user", password: "wrong-password" }));

const flow = engine.defineFlow([start, NavLoginBlock, FillUsernameBlock, FillPasswordBlock, SubmitLoginBlock, end]);
const runOut = await flow.run(context, mem, { page, closeOnFinish: false });
const result = runOut && typeof runOut === "object" && "result" in runOut ? runOut.result : runOut;

const errorVisible = await page.locator('[data-test="error"]').isVisible();
const url = page.url();

console.log("RUNTIME: checkpoint =", result.__state);
console.log("RUNTIME: url =", url);
console.log("RUNTIME: error banner visible =", errorVisible);

if (result.__state !== "LoginPage" || !errorVisible) {
  console.error("RUNTIME: FAIL");
  await browser.close();
  process.exit(1);
}

console.log("RUNTIME: PASS — stayed on LoginPage with error banner.");
await browser.close();
