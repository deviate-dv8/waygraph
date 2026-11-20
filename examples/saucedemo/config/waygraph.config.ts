import { Engine, defineConfig, kokoroVoice } from "waygraph";

const config = defineConfig({
  baseUrl: "https://www.saucedemo.com",
  // A recorded demo (--video) speaks its captions, slides and steps; `waygraph install` sets the voice up.
  demo: { voice: { speaker: kokoroVoice(), steps: true } },
  // Every label a flow may carry (map({ labels })): a typo in a flow or in regression.exclude is a type error. A label can also pick flows
  // by glob or export name; `[]` is one only flows name themselves. Run a group on its own: waygraph test --flows --label auth
  labels: {
    auth: ["src/flows/auth/**"],
    checkout: ["src/flows/checkout/**"],
    cart: [],
    smoke: [],
    showcase: [],
    api: [],
    hybrid: [],
    panes: [],
    seeded: [],
  },
  // The full run plays every flow, labelled or not, except the flows labelled with these (waygraph test --flows --label seeded runs them, --all everything).
  regression: { exclude: ["seeded"] },
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
