import { defineConfig } from "waygraph";

export default defineConfig({ labels: { smoke: [], "empty-db": [] }, regression: { exclude: ["empty-db"] } });
