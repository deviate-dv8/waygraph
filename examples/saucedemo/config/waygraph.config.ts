import { Engine, defineConfig } from "waygraph";

const config = defineConfig({
  baseUrl: "https://www.saucedemo.com",
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
