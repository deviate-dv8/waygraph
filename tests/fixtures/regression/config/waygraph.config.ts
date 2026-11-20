import { defineConfig } from "waygraph";

export default defineConfig({
  labels: { "empty-db": ["dbFlow"], smoke: ["okFlow", "dbFlow"] },
  regression: { exclude: ["empty-db"] },
});
