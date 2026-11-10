import { Engine, defineConfig, kokoroVoice } from "waygraph";

const config = defineConfig({
  baseUrl: "https://www.saucedemo.com",
  // A recorded demo (--video) speaks its captions, slides and steps; `waygraph install` sets the voice up.
  demo: { voice: { speaker: kokoroVoice(), steps: true } },
  // Groups of flows to run on their own: waygraph test --flows --label auth
  labels: {
    auth: ["src/flows/auth/**"],
    checkout: ["src/flows/checkout/**"],
  },
  playwright: {
    workers: 1,
    fullyParallel: false,
    timeout: 30_000,
    use: {
      headless: true,
      launchOptions: { args: ["--no-sandbox", "--disable-dev-shm-usage"] },
    },
  },
});

export default config;
export const engine = new Engine(config);
