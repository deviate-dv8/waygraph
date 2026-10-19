// Split out of the former 8,700-line cli.ts (see src/ARCHITECTURE.md). Behavior unchanged.
import { packageRoot } from "../cli/util.js";
import { basename, join, relative, resolve } from "node:path";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

function initCommand(projectName: string): void {
  if (!projectName) {
    console.error("waygraph init: missing <project-name>, e.g. waygraph init my-app");
    process.exit(1);
  }
  const targetDir = resolve(process.cwd(), projectName);
  const pkgName = basename(targetDir);
  if (existsSync(targetDir)) {
    const entries = readdirSync(targetDir);
    if (entries.length > 0) {
      console.error(`waygraph init: "${targetDir}" already exists and is not empty`);
      process.exit(1);
    }
  } else {
    mkdirSync(targetDir, { recursive: true });
  }
  const templateDir = join(packageRoot(), "templates", "scaffold");
  if (!existsSync(templateDir)) {
    console.error(`waygraph init: scaffold template missing at ${templateDir}`);
    process.exit(1);
  }
  cpSync(templateDir, targetDir, { recursive: true });
  const gitignoreSrc = join(targetDir, "gitignore");
  if (existsSync(gitignoreSrc)) {
    writeFileSync(join(targetDir, ".gitignore"), readFileSync(gitignoreSrc, "utf-8"));
    rmSync(gitignoreSrc);
  }
  // Demo pages open via file://; the absolute path is only known once copied, so it's filled in here.
  const appBaseUrl = pathToFileURL(join(targetDir, "src", "map", "(app_base)", "index.html")).href;
  const packageJsonPath = join(targetDir, "package.json");
  const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8").replaceAll("__PROJECT_NAME__", pkgName));
  // Pin the project to the waygraph that created it - a stale range here installs an old engine.
  const ownVersion = JSON.parse(readFileSync(join(packageRoot(), "package.json"), "utf-8")).version;
  pkg.dependencies.waygraph = `^${ownVersion}`;
  writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + "\n");
  const playwrightConfigPath = join(targetDir, "playwright.config.ts");
  writeFileSync(
    playwrightConfigPath,
    readFileSync(playwrightConfigPath, "utf-8").replaceAll("__APP_BASE_URL__", appBaseUrl),
  );
  console.log(`Scaffolded ${pkgName}/`);
  console.log("");
  console.log(`  cd ${relative(process.cwd(), targetDir) || pkgName}`);
  console.log("  npm install");
  console.log("  npx playwright install chromium");
  console.log("  npm test");
  console.log("  waygraph list        # .flow.ts → export map");
  console.log("  waygraph check       # nav hygiene + inline selectors + bad practices + orphan Blocks");
  console.log("  waygraph typecheck   # tsc --noEmit + bad-practice warnings (use --no-practices to skip)");
  console.log("  waygraph auto        # interactive explore (headed panel)");
  console.log("  waygraph auto --cli  # same menus in the terminal");
  console.log("  waygraph demo --blocks exampleFlow");
  console.log("  waygraph graph       # static state graph JSON");
  console.log("");
  console.log("  Layout: see STRUCTURE.md (or https://deviate-dv8.github.io/waygraph/scaffold.html)");
}

export async function initCase(args: string[]): Promise<void> {
      initCommand(args[1] ?? "");
      return;
}
