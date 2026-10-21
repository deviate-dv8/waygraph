import { defineConfig } from "waygraph";

export default defineConfig({
  baseUrl: "__APP_BASE_URL__",
  // baseUrl: "https://example.com",                       // your real app; relative Nav urls resolve against it
  // extensions: ["hoppscotch"],                           // browser extensions to load (REST testing)
  // webServer: { command: "npm start", port: 3000 },      // started around test / run / demo / auto
  // testDir: "tests",
  // playwright: { workers: 1, timeout: 60_000, use: { video: "on" } },   // merged over the test defaults
});
