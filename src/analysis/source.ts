// Source-text reads for `waygraph list` / `nav`: no import, regex only.
import { readFileSync } from "node:fs";

export function extractFlowNames(filePath: string): string[] {
  const src = readFileSync(filePath, "utf-8");
  const names: string[] = [];
  const re = /export\s+const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*[=:]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const name = m[1];
    if (name !== undefined) names.push(name);
  }
  return names;
}


/** `LoginBlock` -> `"login"`; `OverviewMetricsBlock` -> `"overview-metrics"`. */
export function blockExportToLabel(exportId: string): string {
  const base = exportId.replace(/Block$/, "");
  return base
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}


/** Every `...Block` identifier a `.flow.ts` file imports, in source order. */
export function parseBlockImports(filePath: string): string[] {
  const src = readFileSync(filePath, "utf-8");
  const names: string[] = [];
  const re = /import\s*\{([^}]*)\}\s*from\s*["'][^"']*\.block(?:\.js)?["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    for (const part of m[1]!.split(",")) {
      const name = part.trim().split(/\s+as\s+/)[0]?.trim();
      if (name) names.push(name);
    }
  }
  return names;
}


/** Every `page.goto("...")` string literal in a file, in source order. */
export function extractGotos(filePath: string): string[] {
  const src = readFileSync(filePath, "utf-8");
  const results: string[] = [];
  const re = /\.goto\(\s*["'`]([^"'`]*)["'`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const url = m[1];
    if (url !== undefined) results.push(url);
  }
  return results;
}


/** Every `Trait.url({ pathname: "..." })` target in a file, in source order. */
export function extractUrlTraits(filePath: string): string[] {
  const src = readFileSync(filePath, "utf-8");
  const results: string[] = [];
  const re = /Trait\.url\(\s*\{[^}]*pathname:\s*["'`]([^"'`]*)["'`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const url = m[1];
    if (url !== undefined) results.push(url);
  }
  return results;
}
