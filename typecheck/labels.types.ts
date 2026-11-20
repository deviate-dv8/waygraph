import { defineConfig, Engine } from "../src/index.js";

// The config's labels are the vocabulary: a flow's labels and regression.exclude can only name them.
const config = defineConfig({ labels: ["smoke", "empty-db"], regression: { exclude: ["empty-db"] } });
const engine = new Engine(config);

export const ok = engine.map({ labels: ["smoke", "empty-db"] });

// @ts-expect-error: "smok" isn't a label of the config
export const typo = engine.map({ labels: ["smok"] });

// @ts-expect-error: nor is it one regression can exclude
export const badExclude = defineConfig({ labels: ["smoke"], regression: { exclude: ["smok"] } });

// Several named sets, each with include and exclude, on the same labels.
export const sets = defineConfig({ labels: ["smoke", "auth"], regression: { default: { exclude: ["auth"] }, nightly: { include: ["smoke"] } } });

// @ts-expect-error: nor one a named set can include
export const badInclude = defineConfig({ labels: ["smoke"], regression: { nightly: { include: ["smok"] } } });

// Without labels in the config, any string works as before.
export const free = new Engine().map({ labels: ["anything"] });

// The object form also picks flows into a label by glob, and types the same way.
const picked = new Engine(defineConfig({ labels: { auth: ["src/flows/auth/**"], smoke: [] } }));
export const pickedOk = picked.map({ labels: ["auth", "smoke"] });
// @ts-expect-error: not a label of the object form either
export const pickedTypo = picked.map({ labels: ["autth"] });
