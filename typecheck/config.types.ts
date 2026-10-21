import { defineConfig } from "../src/index.js";

// Every field is typed, including the Playwright passthrough.
export const ok = defineConfig({
  baseUrl: "https://example.com",
  testDir: "tests",
  extensions: ["hoppscotch", "./my-ext", { id: "amknoiejhlmhancpahfcfcfhllgkpbld", sha256: "abc" }],
  webServer: { command: "npm start", port: 3000, reuseExistingServer: true },
  playwright: { workers: 1, timeout: 60_000, retries: 2, use: { video: "on", trace: "on", headless: true } },
});

defineConfig({
  // @ts-expect-error playwright's `retries` is a number
  playwright: { retries: "many" },
});

defineConfig({
  // @ts-expect-error `video` only accepts Playwright's own modes
  playwright: { use: { video: "sometimes" } },
});

defineConfig({
  // @ts-expect-error not a Playwright option
  playwright: { workerz: 1 },
});

defineConfig({
  // @ts-expect-error unknown top-level key
  baseURL: "https://example.com",
});

defineConfig({
  // @ts-expect-error webServer needs a command
  webServer: { port: 3000 },
});

// @ts-expect-error extensions entries are strings or { id | path | sha256 }
defineConfig({ extensions: [42] });

// The same object feeds the Engine.
import { Engine } from "../src/index.js";
export const engine = new Engine(ok);
