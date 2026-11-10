import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { playwrightConfigFrom } from "../../src/runtime/playwright-config.js";

describe("playwrightConfigFrom", () => {
  it("defaults to tests/, the base url and a trace on failure", () => {
    const c = playwrightConfigFrom({}, "/p", "http://x");
    assert.equal(c.testDir, "/p/tests");
    assert.equal(c.use?.baseURL, "http://x");
    assert.equal(c.use?.trace, "retain-on-failure");
    assert.equal(c.webServer, undefined);
  });

  it("merges the playwright block over the defaults, keeping use's own defaults", () => {
    const c = playwrightConfigFrom({ testDir: "e2e", playwright: { workers: 1, use: { video: "on" } } }, "/p", "http://x");
    assert.equal(c.testDir, "/p/e2e");
    assert.equal(c.workers, 1);
    assert.deepEqual(c.use, { baseURL: "http://x", trace: "retain-on-failure", video: "on" });
  });

  it("resolves a webServer's cwd against the project", () => {
    const c = playwrightConfigFrom({ webServer: { command: "npm start", port: 3000, cwd: "app" } }, "/p", undefined);
    assert.deepEqual(c.webServer, [{ command: "npm start", port: 3000, cwd: "/p/app" }]);
  });

  it("the config's device is every test's browser: its size, pixel ratio, phone layout and touch", () => {
    const c = playwrightConfigFrom({ device: { preset: "mobile", orientation: "landscape" } }, "/proj", undefined);
    assert.deepEqual(
      { viewport: c.use?.viewport, deviceScaleFactor: c.use?.deviceScaleFactor, isMobile: c.use?.isMobile, hasTouch: c.use?.hasTouch },
      { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    );
    // Its own playwright.use still wins.
    assert.deepEqual(playwrightConfigFrom({ device: "tablet", playwright: { use: { viewport: { width: 1, height: 2 } } } }, "/proj", undefined).use?.viewport, { width: 1, height: 2 });
    assert.equal(playwrightConfigFrom({}, "/proj", undefined).use?.viewport, undefined);
  });
});
