// Where each page lives: the addresses the manifest gives its Blocks and Checkpoints, for Waygraph UI's site map. A Nav or
// Page Block with a `url` has one (a url built from mem reads as a pattern: `/requests/:id`); a Block whose verify checks
// `Trait.url({ pathname })` names the address of the page it lands on.
import { Node, Project, SyntaxKind } from "ts-morph";

type Marked = {
  __waygraphNavUrl?: unknown;
  __waygraphNavUrlFn?: unknown;
  instruction?: { verify?: unknown };
};

const project = new Project({ useInMemoryFileSystem: true, skipFileDependencyResolution: true });

/** The Block's address when it navigates by url: the url, or the pattern a url built from mem makes. */
export function urlOf(block: unknown): string | undefined {
  const marked = block as Marked;
  if (typeof marked.__waygraphNavUrl === "string") return marked.__waygraphNavUrl;
  if (typeof marked.__waygraphNavUrlFn === "function") return patternOf(marked.__waygraphNavUrlFn);
  return undefined;
}

/**
 * The address a url function builds, read from its source: a template literal's text with each `${...}` as a named
 * parameter (`/requests/${mem.get(Request.id)}` reads `/requests/:id`), or a string it returns. Anything else (a url
 * assembled some other way) has no pattern to show.
 */
function patternOf(fn: Function): string | undefined {
  const sf = project.createSourceFile("url.ts", `const url = ${fn.toString()};`, { overwrite: true });
  const template = sf.getFirstDescendantByKind(SyntaxKind.TemplateExpression);
  if (template) {
    return (
      template.getHead().getLiteralText() +
      template
        .getTemplateSpans()
        .map((span) => `:${paramName(span.getExpression())}${span.getLiteral().getLiteralText()}`)
        .join("")
    );
  }
  const literal = sf.getFirstDescendantByKind(SyntaxKind.NoSubstitutionTemplateLiteral) ?? sf.getFirstDescendantByKind(SyntaxKind.StringLiteral);
  return literal?.getLiteralText();
}

/** Words in an expression that say how a value is fetched, not what it is. */
const PLUMBING = new Set(["mem", "get", "key", "String", "encodeURIComponent", "toString", "value"]);

/** A parameter's name from the expression that fills it: its last meaningful word (`mem.get(Machine.code)` -> `code`). */
function paramName(expression: Node): string {
  const words = expression.getDescendantsOfKind(SyntaxKind.Identifier).map((id) => id.getText());
  if (Node.isIdentifier(expression)) words.push(expression.getText());
  const word = words.filter((w) => !PLUMBING.has(w)).pop() ?? "param";
  return word.charAt(0).toLowerCase() + word.slice(1);
}

/** The url a `Trait.url` check matches, as an address to show (its pathname, on its host when it names one). */
function urlOfCheck(check: unknown): string | undefined {
  const pattern = (check as { __waygraphUrl?: { pathname?: string; hostname?: string; protocol?: string } }).__waygraphUrl;
  if (!pattern || (!pattern.pathname && !pattern.hostname)) return undefined;
  if (!pattern.hostname) return pattern.pathname;
  return `${pattern.protocol ?? "https"}://${pattern.hostname}${pattern.pathname ?? ""}`;
}

/**
 * The addresses each Checkpoint's page is known by: the url of every Nav or Page Block that lands on it, and the url
 * every Block's verify checks for it. A verify written as a function of the outcome is asked for each outcome; one that
 * can't answer without a page says nothing.
 */
export function pageUrls(blocks: readonly { block: unknown; to: readonly string[] }[]): Record<string, string[]> {
  const urls: Record<string, Set<string>> = {};
  const add = (tag: string, url: string | undefined) => {
    if (url && tag !== "*") (urls[tag] ??= new Set()).add(url);
  };
  for (const { block, to } of blocks) {
    const url = urlOf(block);
    if (url) for (const tag of to) add(tag, url);
    const verify = (block as Marked).instruction?.verify;
    for (const tag of to) {
      let checks: unknown = verify;
      if (typeof verify === "function") {
        try {
          checks = (verify as (out: { __state: string }) => unknown)({ __state: tag });
        } catch {
          // A verify that needs more than the outcome to choose its checks: no address from it.
          checks = [];
        }
      }
      if (Array.isArray(checks)) for (const check of checks) add(tag, urlOfCheck(check));
    }
  }
  return Object.fromEntries(Object.entries(urls).map(([tag, set]) => [tag, [...set]]));
}
