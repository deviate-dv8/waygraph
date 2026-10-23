/**
 * One log format for the live overlay surfaces (auto / browser / pilot): `[HH:MM:SS.mmm] waygraph <surface>: ...`, the
 * same shape as the demo runner's `step-mode/demo-log.ts`. Silenced by WAYGRAPH_JSON=1.
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
