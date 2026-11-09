// Plays the three suites (page objects, waygraph, waygraph Blocks wrapping the page objects) against the UI as it is
// and against each change in ui-change.ts, and writes what each did: passed or failed, where it stopped, what it said,
// how long it took. `npm run compare` (headless, against www.saucedemo.com).
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const CHANGES = ["", "renamed-login", "broken-add"];

/** The step a waygraph failure names (`failed after "a -> b"`, `act of "b" failed`): where it stopped, for the table. */
const stepOf = (message) => {
  const after = /failed after "([^"]+)"/.exec(message)?.[1];
  const act = /act of "([^"]+)" failed/.exec(message)?.[1];
  const name = act ?? after?.split(" -> ").at(-1);
  return name ? `step ${name}` : undefined;
};
const rows = [];
for (const change of CHANGES) {
  let out;
  try {
    out = execFileSync("npx", ["playwright", "test", "--reporter=json"], {
      env: { ...process.env, UI_CHANGE: change, FORCE_COLOR: "0" },
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (failed) {
    out = failed.stdout;
  }
  const report = JSON.parse(out);
  const walk = (suite) => [...(suite.specs ?? []).flatMap((spec) => spec.tests.map((t) => ({ spec, t }))), ...(suite.suites ?? []).flatMap(walk)];
  for (const { t } of report.suites.flatMap(walk)) {
    const result = t.results.at(-1);
    const error = result.errors?.[0];
    const message = (error?.message ?? "").replace(/\u001b\[[0-9;]*m/g, "").split("\n").find((l) => l.trim()) ?? "";
    rows.push({
      change: change || "(none)",
      suite: t.projectName,
      status: result.status,
      seconds: (result.duration / 1000).toFixed(1),
      at: stepOf(message) ?? (error?.location ? `${error.location.file.replace(process.cwd() + "/", "")}:${error.location.line}` : ""),
      message: message.trim().slice(0, 220),
    });
  }
}
const table = [
  "| UI change | Suite | Result | Time | Stopped at | What it said |",
  "|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.change} | ${r.suite} | ${r.status} | ${r.seconds} s | ${r.at ? `\`${r.at}\`` : ""} | ${r.message.replace(/\|/g, "\\|")} |`),
].join("\n");
writeFileSync("RESULTS.md", `# Results\n\nWritten by \`npm run compare\`.\n\n${table}\n`);
console.log(table);
