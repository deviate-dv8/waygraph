/**
 * One log format for every overlay surface (demo / auto / browser / pilot): `waygraph <surface>: ...`
 * with a `HH:MM:SS.mmm` prefix, same shape as `runner/demo-log.js`'s (demo stays on the JS copy since
 * it runs in the target project's own process; this one is for TS-side code — pilot/auto/browser —
 * that can't import a plain .js runner module). Silenced by WAYGRAPH_JSON=1, same convention as demo.
 */
function ts(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

export function verboseLog(surface: string, msg: string): void {
  if (process.env.WAYGRAPH_JSON === "1") return;
  console.log(`[${ts()}] waygraph ${surface}: ${msg}`);
}
