import { Engine, defineConfig, kokoroVoice } from "waygraph";

const config = defineConfig({
  baseUrl: "https://www.saucedemo.com",
  // A recorded demo (--video) speaks its captions, slides and steps; `waygraph install` sets the voice up.
  demo: { voice: { speaker: kokoroVoice(), steps: true } },
  // Every label a flow may carry (map({ labels })): a typo in a flow or in regression is a type error.
  // waygraph test --label auth runs a group on its own.
  labels: ["auth", "checkout", "cart", "smoke", "showcase", "api", "hybrid", "panes", "seeded"],
  // The full run plays every flow, labelled or not, except the flows labelled with `exclude` (waygraph test --label seeded runs them, --all everything).
  regression: {
    default: { exclude: ["seeded"] },
    smoke: { include: ["smoke"] },   // waygraph test --regression smoke
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
