#!/usr/bin/env node
// tsc doesn't copy plain .js: ship src/runner/*.js next to the compiled output as dist/runner/.
import { cpSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
rmSync(join(root, "dist", "runner"), { recursive: true, force: true });
cpSync(join(root, "src", "runner"), join(root, "dist", "runner"), { recursive: true });
