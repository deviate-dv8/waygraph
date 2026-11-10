import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FOLDER, SITE, ancestorPages, parentPage, siteTree } from "../../src/manifest/site-map.js";

const urls = {
  Platform: ["/platform"],
  Equipment: ["/platform/plant/equipment"],
  EquipmentNew: ["/platform/plant/equipment/new"],
  Login: ["https://app.test/auth/login"],
  Inbox: ["https://mail.test/"],
};

describe("site map", () => {
  const tree = siteTree(Object.keys(urls), urls, "https://app.test");

  it("hangs each page from the page or folder its address extends, each site at the root", () => {
    assert.deepEqual(tree.sites.map((s) => s.label), ["app.test", "mail.test"]);
    assert.equal(tree.parents.EquipmentNew, "Equipment");
    assert.equal(tree.parents.Equipment, `${FOLDER}https://app.test/platform/plant`);
    assert.equal(tree.parents[`${FOLDER}https://app.test/platform/plant`], "Platform");
    assert.equal(tree.parents.Platform, `${SITE}https://app.test`);
    assert.equal(tree.parents.Login, `${FOLDER}https://app.test/auth`);
    assert.deepEqual(tree.folders.map((f) => f.label).sort(), ["auth/", "plant/"]);
  });

  it("a page's ancestors are the pages above it, outermost first; folders and sites aren't pages", () => {
    assert.deepEqual(ancestorPages(tree, "EquipmentNew"), ["Platform", "Equipment"]);
    assert.equal(parentPage(tree, "EquipmentNew"), "Equipment");
    assert.equal(parentPage(tree, "Equipment"), "Platform");
    assert.equal(parentPage(tree, "Platform"), undefined);
    assert.equal(parentPage(tree, "Login"), undefined);
  });
});
