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
  // slowMo: 250,                            // shared by run and demo: ms to pause around each browser action
  // headed: true,                           // shared: show the browser window (demo and auto already do)
  // run: {                                  // `waygraph run` only; overrides the shared values above
  //   slowMo: 0,
  //   video: { viewport: "1280x720" },
  // },
  // demo: {                                 // `waygraph demo` only; overrides the shared values above
  //   pace: "fast",                         //   default pace for steps that set none: "fast" | "slow" | "blitz" | 0.5 | 2
  //   speeds: { blitz: 0.05, fast: 0.33, slow: 2 },   // what each pace means, x normal dwell (lower = faster)
  //   typingMs: 30,                         //   typing animation, ms per character (0 types instantly)
  //   slowMo: 350,                          //   pause after each action, once per action (a step with pace "blitz" skips it)
  //   autoNext: true,                       //   advance steps without clicking Next
  //   fast: false,                          //   shorter Next / auto-next gates
  //   video: { viewport: "1920x1080" },
  // },
  // webServer: { command: "npm start", port: 3000 },   // started around test / run / demo / auto
  // runLog: false,                          // each run is logged to .waygraph/runs/ (what Waygraph UI shows)

  // Another config for another environment: config/waygraph.staging.config.ts, chosen with `waygraph test --config staging`.

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
