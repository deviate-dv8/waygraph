// Copies examples/saucedemo into templates/quickstart (the project `waygraph try demo` runs), keeping the quickstart's own
// package.json, README, tests and docs.
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";

for (const dir of ["src", "config"]) {
  rmSync(`templates/quickstart/${dir}`, { recursive: true, force: true });
  cpSync(`examples/saucedemo/${dir}`, `templates/quickstart/${dir}`, { recursive: true });
}
cpSync("examples/saucedemo/tsconfig.json", "templates/quickstart/tsconfig.json");
const own = JSON.parse(readFileSync("templates/quickstart/package.json", "utf8"));
own.scripts = JSON.parse(readFileSync("examples/saucedemo/package.json", "utf8")).scripts;
writeFileSync("templates/quickstart/package.json", JSON.stringify(own, null, 2) + "\n");
console.log("templates/quickstart synced from examples/saucedemo");
