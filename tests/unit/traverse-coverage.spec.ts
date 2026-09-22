import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCoverageReport,
  collectGraphEdgeKeys,
  formatCoverageLine,
  normalizeHitKey,
  parseMinEdgeCoverage,
} from "../../src/traverse-coverage.js";

describe("traverse-coverage (Phase E)", () => {
  it("parseMinEdgeCoverage accepts fraction, percent, and 0-100", () => {
    assert.equal(parseMinEdgeCoverage(0.8), 0.8);
    assert.equal(parseMinEdgeCoverage("0.5"), 0.5);
    assert.equal(parseMinEdgeCoverage("80%"), 0.8);
    assert.equal(parseMinEdgeCoverage("80"), 0.8);
    assert.equal(parseMinEdgeCoverage(""), null);
    assert.equal(parseMinEdgeCoverage("nope"), null);
    assert.equal(parseMinEdgeCoverage(150), null);
  });

  it("collectGraphEdgeKeys uniques by block name", () => {
    assert.deepEqual(
      collectGraphEdgeKeys([
        { block: "login" },
        { block: "logout" },
        { block: "login" },
      ]),
      ["login", "logout"],
    );
  });

  it("normalizeHitKey maps instance hits onto graph blocks", () => {
    const g = new Set(["add-to-cart", "login"]);
    assert.equal(normalizeHitKey("add-to-cart::sku-1", g), "add-to-cart");
    assert.equal(normalizeHitKey("login", g), "login");
    assert.equal(normalizeHitKey("unknown::x", g), null);
  });

  it("buildCoverageReport computes ratio + gate", () => {
    const report = buildCoverageReport({
      projectDir: "/tmp/demo",
      parallel: 1,
      allEdgeKeys: ["a", "b", "c", "d"],
      hitKeys: ["a", "b::1", "orphan"],
      minEdgeCoverage: 0.5,
    });
    assert.equal(report.edgesTotal, 4);
    assert.equal(report.edgesHit, 2);
    assert.equal(report.ratio, 0.5);
    assert.deepEqual(report.hit, ["a", "b"]);
    assert.deepEqual(report.missed, ["c", "d"]);
    assert.equal(report.coveragePass, true);
    assert.ok(formatCoverageLine(report).includes("min=50.0% PASS"));
  });

  it("coverage gate fails when ratio below min", () => {
    const report = buildCoverageReport({
      projectDir: "/tmp/demo",
      parallel: 2,
      allEdgeKeys: ["a", "b", "c", "d"],
      hitKeys: ["a"],
      minEdgeCoverage: 0.8,
    });
    assert.equal(report.coveragePass, false);
    assert.match(formatCoverageLine(report), /FAIL/);
  });
});
