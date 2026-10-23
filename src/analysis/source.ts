// What `waygraph list` / `nav` print, read from each file's AST without importing it.
import { exportedNames, namedImportsFrom, objectArgProperty, parseSource, stringArgs } from "../manifest/source.js";

export function extractFlowNames(filePath: string): string[] {
  return exportedNames(parseSource(filePath));
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
  return namedImportsFrom(parseSource(filePath), (spec) => /\.block(\.js)?$/.test(spec));
}


/** Every `page.goto("...")` URL in a file, in source order. */
export function extractGotos(filePath: string): string[] {
  return stringArgs(parseSource(filePath), (callee) => callee.endsWith(".goto"));
}


/** Every `Trait.url({ pathname: "..." })` target in a file, in source order. */
export function extractUrlTraits(filePath: string): string[] {
  return objectArgProperty(parseSource(filePath), (callee) => callee === "Trait.url", "pathname");
}
