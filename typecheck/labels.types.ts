import { defineConfig, Engine } from "../src/index.js";

// The config's labels are the vocabulary: a flow's labels and regression.exclude can only name them.
const config = defineConfig({ labels: { smoke: [], "empty-db": ["src/flows/onboarding/**"] }, regression: { exclude: ["empty-db"] } });
const engine = new Engine(config);

export const ok = engine.map({ labels: ["smoke", "empty-db"] });

// @ts-expect-error: "smok" isn't a label of the config
export const typo = engine.map({ labels: ["smok"] });

// @ts-expect-error: nor is it one regression can exclude
export const badExclude = defineConfig({ labels: { smoke: [] }, regression: { exclude: ["smok"] } });

// Without labels in the config, any string works as before.
export const free = new Engine().map({ labels: ["anything"] });
