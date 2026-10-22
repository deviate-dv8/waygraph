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

// A function form reads the loaded .env values.
export const fromEnv = defineConfig(({ mode, env }) => ({ baseUrl: env.BASE_URL ?? `https://${mode}.example.com` }));

// @ts-expect-error unknown key in a function-form config
defineConfig(() => ({ typo: 1 }));

export const runSettings = defineConfig({
  video: { dir: "~/Downloads/waygraph-videos", viewport: "1920x1080" },
  slowMo: 250,
  headed: true,
  demo: { autoNext: true, fast: false },
});

defineConfig({
  // @ts-expect-error viewport is a "WxH" string
  video: { viewport: 1920 },
});

export const perCommand = defineConfig({
  slowMo: 100,
  run: { slowMo: 0, headed: false, video: { viewport: "1280x720" } },
  demo: { pace: "fast", typingMs: 10, slowMo: 350, autoNext: true, fast: false },
});

defineConfig({
  // @ts-expect-error pace is "fast" | "slow" | "blitz" | "normal" | a number
  demo: { pace: "turbo" },
});
