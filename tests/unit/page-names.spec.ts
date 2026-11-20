import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findUnknownPages } from "../../src/analysis/page-names.js";
import type { Manifest } from "../../src/manifest/manifest.js";

/** A manifest with these pages and the Methods they hold (`to` per Method). */
function manifestOf(pages: { name: string; checkpoint?: string; from?: string[]; covers?: "children" | string[]; links?: string[]; moves?: string[] }[]): Manifest {
  return {
    pages: pages.map((p) => ({ id: `f#${p.name}`, name: p.name, ...(p.checkpoint ? { checkpoint: p.checkpoint } : {}), from: p.from ?? [], ...(p.covers ? { covers: p.covers } : {}), links: (p.links ?? []).map((to, i) => ({ key: `l${i}`, to })) })),
    blocks: pages.flatMap((p) => (p.moves ?? []).map((to, i) => ({ name: `${p.name}-m${i}`, group: "do", owner: `f#${p.name}`, to: [to], from: [] }))),
  } as unknown as Manifest;
}

describe("page names", () => {
  it("is quiet when every name written is a page, a 'parent' link or Start", () => {
    const manifest = manifestOf([
      { name: "page-a", checkpoint: "Documents", links: ["Templates", "parent"], moves: ["Templates"], from: ["__start__"] },
      { name: "page-b", checkpoint: "Templates", covers: ["Documents"] },
    ]);
    assert.deepEqual(findUnknownPages(manifest), []);
  });

  it("names a typo in a move, a link, covers and from, with the page it probably meant", () => {
    const manifest = manifestOf([
      { name: "page-a", checkpoint: "Documents", links: ["Documnts"], moves: ["Templatez"], from: ["Tempates"] },
      { name: "shell", covers: ["Docments"] },
      { name: "page-b", checkpoint: "Templates" },
    ]);
    assert.deepEqual(
      findUnknownPages(manifest).map((u) => [u.page, u.where, u.name, u.suggestion]),
      [
        ["page-a", "from", "Tempates", "Templates"],
        ["page-a", "link", "Documnts", "Documents"],
        ["page-a", "move", "Templatez", "Templates"],
        ["shell", "covers", "Docments", "Documents"],
      ],
    );
  });

  it("offers no page when the name is nothing like one", () => {
    const [unknown] = findUnknownPages(manifestOf([{ name: "page-a", checkpoint: "Documents", links: ["Zzzzzzzzzz"] }]));
    assert.equal(unknown?.suggestion, undefined);
  });
});
