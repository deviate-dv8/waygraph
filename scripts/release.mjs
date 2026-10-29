// npm run release: publishes the version in package.json to npm, then tags that commit vX.Y.Z and creates its GitHub
// Release, the commits since the previous version as its notes. Run it once the version's commits are on main.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", ...opts }).trim();
const fail = (why) => {
  console.error(`release: ${why}`);
  process.exit(1);
};

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const tag = `v${version}`;

if (run("git", ["status", "--porcelain"])) fail("the working tree has changes; commit them first");
if (run("git", ["branch", "--show-current"]) !== "main") fail("release from main");
run("git", ["fetch", "--quiet", "origin", "main", "--tags"]);
const head = run("git", ["rev-parse", "HEAD"]);
if (head !== run("git", ["rev-parse", "origin/main"])) fail("main isn't pushed (or is behind origin); push first");
if (run("git", ["tag", "--list", tag])) fail(`${tag} is already tagged; bump the version for a new release`);

const previous = run("git", ["describe", "--tags", "--abbrev=0", "--match", "v[0-9]*", "HEAD"], { stdio: ["ignore", "pipe", "ignore"] });
const log = run("git", ["log", "--no-merges", "--format=- %s (%h)", `${previous}..HEAD`]);
const notes = join(tmpdir(), `waygraph-${tag}-notes.md`);
writeFileSync(notes, `${log || "- No changes since " + previous}\n\n**Full changes**: ${previous}...${tag}\n`);

run("npm", ["run", "build"], { stdio: "inherit" });
run("npm", ["publish"], { stdio: "inherit" });
run("git", ["tag", "-a", tag, "-m", tag, head]);
run("git", ["push", "origin", tag], { stdio: "inherit" });
run("gh", ["release", "create", tag, "--verify-tag", "--title", tag, "--notes-file", notes], { stdio: "inherit" });
console.log(`release: ${tag} is on npm and GitHub`);
