#!/usr/bin/env node
// Writes docs/env.md from the WAYGRAPH_* registry (src/engine/env.ts), so the page lists exactly what waygraph reads.
// Run: node --import tsx scripts/gen-env.mjs (part of npm run docs:api)
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WAYGRAPH_ENV } from "../src/engine/env.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const rows = Object.entries(WAYGRAPH_ENV)
  .map(([name, meaning]) => `| \`${name}\` | ${meaning.replace(/\|/g, "\\|")} |`)
  .join("\n");
const md = `# Environment variables

Every \`WAYGRAPH_*\` variable waygraph reads. Most are set for you from flags and \`config/waygraph.config.ts\`; a flag
beats the variable, which beats the config file. On / off variables take \`1\` / \`true\` / \`yes\` / \`on\` or \`0\` /
\`false\` / \`no\` / \`off\`.

This page is generated from \`src/engine/env.ts\` (\`npm run docs:api\`).

| Variable | Meaning |
| --- | --- |
${rows}
`;
writeFileSync(join(root, "docs", "env.md"), md);
console.log(`docs/env.md: ${Object.keys(WAYGRAPH_ENV).length} variables`);
