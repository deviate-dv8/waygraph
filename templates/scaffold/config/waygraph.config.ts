import { defineConfig } from "waygraph";

export default defineConfig(({ env }) => ({
  baseUrl: env.BASE_URL ?? "__APP_BASE_URL__", // from .env / .env.<mode>: waygraph test --env staging
  // extensions: ["hoppscotch"],                           // browser extensions to load (REST testing)
  // webServer: { command: "npm start", port: 3000 },      // started around test / run / demo / auto
  // testDir: "tests",
  // playwright: { workers: 1, timeout: 60_000, use: { video: "on" } },   // merged over the test defaults
}));
