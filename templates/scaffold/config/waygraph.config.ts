import { Engine, defineConfig } from "waygraph";

const config = defineConfig(({ env }) => ({
  // Where the app under test lives. BASE_URL comes from .env / .env.<mode>:  waygraph test --env staging
  baseUrl: env.BASE_URL ?? "__APP_BASE_URL__",

  // ── waygraph: uncomment what you need ─────────────────────────────────────────────────────────
  // extensions: ["hoppscotch"],             // browser extensions to load (a waygraph feature, not Playwright's)
  // video: {                                // recordings made with `waygraph run|demo --video`
  //   dir: "~/Downloads/waygraph-videos",   //   where they are saved (default: Downloads/waygraph-videos/<project>)
  //   viewport: "1920x1080",                //   recording size: demo defaults to 1920x1080, run to 1280x720
  // },
  // slowMo: 250,                            // ms to pause before each browser action, so a run is watchable
  // headed: true,                           // show the browser window (demo and auto already do)
  // demo: { autoNext: true, fast: false },  // advance demo steps without clicking Next; blitz fast-forward steps
  // webServer: { command: "npm start", port: 3000 },   // started around test / run / demo / auto

  // ── test runner (Playwright) ──────────────────────────────────────────────────────────────────
  // testDir: "tests",
  // playwright: {                           // any Playwright test option, merged over waygraph's defaults
  //   workers: 1,
  //   retries: 1,
  //   timeout: 60_000,
  //   use: { video: "on", trace: "on", screenshot: "only-on-failure", viewport: { width: 1280, height: 720 } },
  // },
}));

export default config;

// Flows import this, so they run with the config above already applied.
export const engine = new Engine(config);
