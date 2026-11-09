import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkpoint } from "../../src/engine/checkpoint/checkpoint.js";
import { defineNavBlock } from "../../src/engine/block/kinds/nav.js";
import { defineMethodBlock } from "../../src/engine/block/kinds/method.js";
import { keys } from "../../src/engine/mem/mem.js";
import { urlMatches } from "../../src/engine/trait/trait.js";
import { pageUrls, urlOf } from "../../src/manifest/urls.js";

const Registry = checkpoint("Registry");
const Detail = checkpoint("Detail");
const Machine = keys("machine")<{ code: string }>();

describe("manifest urls", () => {
  it("a fixed url is the url", () => {
    assert.equal(urlOf(defineNavBlock({ name: "nav-registry", checkpoint: Registry, url: "/registry" })), "/registry");
  });

  it("a url built from mem reads as a pattern, each value a named parameter", () => {
    const nav = defineNavBlock({ name: "nav-detail", checkpoint: Detail, url: (mem) => `/registry/${mem.get(Machine.code)}/edit` });
    assert.equal(urlOf(nav), "/registry/:code/edit");
  });

  it("a page's addresses come from its Navs and from the Trait.url its Blocks verify", () => {
    const nav = defineNavBlock({ name: "nav-registry", checkpoint: Registry, url: "/registry" });
    const open = defineMethodBlock({
      name: "open-detail",
      from: Registry,
      to: Detail,
      instruction: { async act() {}, verify: [urlMatches({ pathname: "/registry/:code" })] },
    });
    assert.deepEqual(
      pageUrls([
        { block: nav, to: ["Registry"] },
        { block: open, to: ["Detail"] },
      ]),
      { Registry: ["/registry"], Detail: ["/registry/:code"] },
    );
  });
});
