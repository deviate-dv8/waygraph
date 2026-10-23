// Reads `<In, Out>` type arguments from Blocks still written in the deprecated form, with TypeScript's own type checker
// (ts-morph): `defineMethodBlock<LoginPage, LoginOutcome>` -> from ["LoginPage"], to ["LoginSuccess", "LoginBadCredentials"],
// whatever aliases and unions those names go through. A Block declared with Checkpoint values carries its route at
// runtime and never reaches this, so ts-morph is only loaded for a project that still has such a Block.
import type { Node, Project } from "ts-morph";

const LEGACY_DEFINES = new Set(["defineBlock", "defineMethodBlock", "defineActionBlock", "defineEffectBlock", "defineMemEffectBlock"]);

let project: Project | undefined;

/** The tags a Checkpoint type stands for: one per union member; `["*"]` for `Checkpoint<string>`; `[]` if unknown. */
function tagsOf(node: Node): string[] {
  const type = node.getType();
  const tags: string[] = [];
  for (const member of type.isUnion() ? type.getUnionTypes() : [type]) {
    const state = member.getProperty("__state")?.getTypeAtLocation(node);
    if (!state) return [];
    if (state.isStringLiteral()) tags.push(String(state.getLiteralValue()));
    else if (state.isString() || state.isAny()) return ["*"];
    else return [];
  }
  return tags;
}

/** Every deprecated `define*Block<In, Out>` call in the file, in source order, with the tags it routes between. */
export async function legacyRoutes(file: string): Promise<{ in: string; out: string; from: string[]; to: string[] }[]> {
  const { Project, SyntaxKind, ts } = await import("ts-morph");
  project ??= new Project({
    compilerOptions: { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, target: ts.ScriptTarget.ES2022, strict: true, skipLibCheck: true },
    skipAddingFilesFromTsConfig: true,
  });
  const existing = project.getSourceFile(file);
  const sf = existing ? (existing.refreshFromFileSystemSync(), existing) : project.addSourceFileAtPath(file);
  project.resolveSourceFileDependencies();
  return sf
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((call) => LEGACY_DEFINES.has(call.getExpression().getText()))
    .flatMap((call) => {
      const [from, to, extra] = call.getTypeArguments();
      if (!from || !to || extra) return [];
      return [{ in: from.getText(), out: to.getText(), from: tagsOf(from), to: tagsOf(to) }];
    });
}
