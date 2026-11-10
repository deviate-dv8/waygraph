import { Engine, defineConfig, kokoroVoice } from "waygraph";

const config = defineConfig({
  baseUrl: "https://www.saucedemo.com",
  // A recorded demo (--video) speaks its captions, slides and steps; `waygraph extensions install` sets the voice up.
  demo: { voice: { speaker: kokoroVoice(), steps: true } },
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
