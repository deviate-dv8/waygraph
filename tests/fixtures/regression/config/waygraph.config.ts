import { defineConfig } from "waygraph";

export default defineConfig({
  labels: ["smoke", "empty-db"],
  regression: {
    default: { exclude: ["empty-db"] },
    "smoke-only": { include: ["smoke"], exclude: ["empty-db"] },
  },
});
