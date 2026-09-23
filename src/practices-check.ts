/**
 * `waygraph check` / `waygraph typecheck` practice warnings — style/typing issues
 * that compile but erode the typed graph. Warnings only (never fail exit code)
 * unless paired with `tsc` errors in `waygraph typecheck`.
 */
import { readFileSync } from "node:fs";
import { relative } from "node:path";

export type PracticeKind =
  | "wildcard-checkpoint"
  | "assert-no-type-arg"
  | "multi-input"
  | "combined-action"
  | "empty-verify";

export interface PracticeWarning {
  kind: PracticeKind;
  file: string;
  /** Short hint for humans/agents. */
  detail: string;
}

export interface PracticeCheckOptions {
  /** Skip all practice scanning (CLI `--no-practices`). */
  disabled?: boolean;
}

/** define*Block<…Checkpoint<string>…> — prefer project Checkpoint types. */
const WILDCARD_CHECKPOINT =
  /\bdefine(?:Method|Effect|Page|Nav|MemNav|NavClick|Action)Block\s*<[^>]*\bCheckpoint\s*<\s*string\s*>/;

/** defineAssertBlock({ … }) with no explicit Out type — defaults to wildcard. */
const ASSERT_NO_TYPE_ARG = /\bdefineAssertBlock\s*\(\s*\{/;

/** defineAssertBlock, any form - used to scope the empty-verify check below. */
const IS_ASSERT_BLOCK = /\bdefineAssertBlock\s*[<(]/;

/**
 * define(Method|Effect)Block<In, Out> with two BARE identifier type args
 * (never a nested generic like Checkpoint<string> - that's WILDCARD_CHECKPOINT's
 * own warning) - lets a real transition (In !== Out) be told apart from a
 * self-loop (In === Out, e.g. fill-username) using only source text.
 */
const METHOD_EFFECT_GENERIC =
  /\bdefine(?:Method|Effect)Block\s*<\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)\s*>/;

/** `verify: []` - a literal empty array, the codegen-stub shape this check exists for. */
const EMPTY_VERIFY_ARRAY = /\bverify\s*:\s*\[\s*\]/;

/** Any `verify:` key at all, empty or not. */
const HAS_VERIFY_KEY = /\bverify\s*:/;

const SCAN_GLOB = /\.(block|flow)\.ts$/;

const METHOD_OR_EFFECT_FILE = /\.(method|effect)\.block\.ts$/;
const METHOD_OR_EFFECT_DEFINE = /\bdefine(?:Method|Effect)Block\b/;

/** Whole-file opt-out: `// waygraph-ignore-practices` */
const IGNORE_ALL = /waygraph-ignore-practices/;

/** Per-kind opt-out: `// waygraph-ignore: multi-input, combined-action` */
const IGNORE_KINDS = /waygraph-ignore:\s*([^\n*]+)/;

function walkBlockAndFlowFiles(projectDir: string, walkDir: (dir: string, re: RegExp) => string[]): string[] {
  return walkDir(projectDir, SCAN_GLOB);
}

function ignoredKindsForFile(src: string): Set<PracticeKind> | "all" {
  if (IGNORE_ALL.test(src)) return "all";
  const m = IGNORE_KINDS.exec(src);
  if (!m) return new Set();
  const kinds = new Set<PracticeKind>();
  for (const token of m[1]!.split(/[,;\s]+/)) {
    const t = token.trim() as PracticeKind;
    if (t) kinds.add(t);
  }
  return kinds;
}

function isIgnored(kind: PracticeKind, ignore: Set<PracticeKind> | "all"): boolean {
  return ignore === "all" || ignore.has(kind);
}

function countMatches(src: string, re: RegExp): number {
  re.lastIndex = 0;
  return (src.match(re) ?? []).length;
}

export function collectPracticeWarnings(
  projectDir: string,
  walkDir: (dir: string, re: RegExp) => string[],
  opts?: PracticeCheckOptions,
): PracticeWarning[] {
  if (opts?.disabled) return [];
  const warnings: PracticeWarning[] = [];
  for (const file of walkBlockAndFlowFiles(projectDir, walkDir)) {
    const rel = relative(projectDir, file).replace(/\\/g, "/");
    const src = readFileSync(file, "utf-8");
    const ignore = ignoredKindsForFile(src);

    if (!isIgnored("wildcard-checkpoint", ignore) && WILDCARD_CHECKPOINT.test(src)) {
      warnings.push({
        kind: "wildcard-checkpoint",
        file: rel,
        detail:
          'uses Checkpoint<string> in a Block helper generic — prefer a typed Checkpoint from src/states/ (e.g. defineMethodBlock<LoginPage, LoginPage>)',
      });
    }
    if (!isIgnored("assert-no-type-arg", ignore) && ASSERT_NO_TYPE_ARG.test(src)) {
      warnings.push({
        kind: "assert-no-type-arg",
        file: rel,
        detail:
          "defineAssertBlock({…}) without an explicit type argument — add defineAssertBlock<YourCheckpoint>({…}) so defineFlow typing stays honest",
      });
    }

    const isMethodOrEffect = METHOD_OR_EFFECT_FILE.test(rel) || METHOD_OR_EFFECT_DEFINE.test(src);
    if (isMethodOrEffect) {
      const fills = countMatches(src, /\.fill\s*\(/g);
      const clicks = countMatches(src, /\.click\s*\(/g);
      if (!isIgnored("multi-input", ignore) && fills >= 2) {
        warnings.push({
          kind: "multi-input",
          file: rel,
          detail: `Method/Effect act() has ${fills} .fill() calls — one distinct input per Block (split into separate defineMethodBlock files, e.g. fill-username + fill-password + submit-login)`,
        });
      }
      if (!isIgnored("combined-action", ignore) && fills >= 1 && clicks >= 1) {
        warnings.push({
          kind: "combined-action",
          file: rel,
          detail:
            "Method/Effect act() mixes .fill() and .click() — fill and submit must be separate Blocks (see examples/saucedemo login split)",
        });
      }
      const genericMatch = METHOD_EFFECT_GENERIC.exec(src);
      const isTransition = !!genericMatch && genericMatch[1] !== genericMatch[2];
      if (
        isTransition &&
        !isIgnored("empty-verify", ignore) &&
        (!HAS_VERIFY_KEY.test(src) || EMPTY_VERIFY_ARRAY.test(src))
      ) {
        warnings.push({
          kind: "empty-verify",
          file: rel,
          detail:
            `transition Block (${genericMatch![1]} → ${genericMatch![2]}) has no verify checks — resolve() moving ` +
            "to a new Checkpoint is never confirmed by anything; add a Trait (or defineAssertBlock right after it), " +
            "or opt out explicitly with // waygraph-ignore: empty-verify if that's intentional",
        });
      }
    }

    if (!isIgnored("empty-verify", ignore) && IS_ASSERT_BLOCK.test(src) && EMPTY_VERIFY_ARRAY.test(src)) {
      warnings.push({
        kind: "empty-verify",
        file: rel,
        detail:
          "defineAssertBlock's verify array is empty — an assert Block whose only job is checking will pass " +
          "trivially forever; fill in real Traits or remove the stub",
      });
    }
  }
  return warnings;
}

export function practiceKindLabel(kind: PracticeKind): string {
  switch (kind) {
    case "wildcard-checkpoint":
      return "wildcard Checkpoint<string>";
    case "assert-no-type-arg":
      return "assert block missing type arg";
    case "multi-input":
      return "multiple inputs in one Block";
    case "combined-action":
      return "fill and click in one Block";
    case "empty-verify":
      return "empty verify — transition unconfirmed";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function formatPracticeWarnings(projectDir: string, warnings: PracticeWarning[]): string[] {
  const lines: string[] = [];
  for (const w of warnings) {
    lines.push(`waygraph practices: ${w.file} (${practiceKindLabel(w.kind)}) — ${w.detail}`);
  }
  if (warnings.length === 0) {
    lines.push(`waygraph practices: no bad-practice patterns under ${projectDir}`);
  } else {
    lines.push(
      `waygraph practices: ${warnings.length} bad-practice warning${warnings.length === 1 ? "" : "s"}`,
    );
  }
  return lines;
}
