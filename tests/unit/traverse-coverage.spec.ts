import { describe, expect, it } from "vitest";
import {
  buildCoverageReport,
  collectGraphEdgeKeys,
  formatCoverageLine,
  normalizeHitKey,
  parseMinEdgeCoverage,
} from "../../src/traverse-coverage.js";

describe("traverse-coverage (Phase E)", () => {
  it("parseMinEdgeCoverage accepts fraction, percent, and 0-100", () => {
    expect(parseMinEdgeCoverage(0.8)).toBe(0.8);
    expect(parseMinEdgeCoverage("0.5")).toBe(0.5);
    expect(parseMinEdgeCoverage("80%")).toBe(0.8);
    expect(parseMinEdgeCoverage("80")).toBe(0.8);
    expect(parseMinEdgeCoverage("")).toBe(null);
    expect(parseMinEdgeCoverage("nope")).toBe(null);
    expect(parseMinEdgeCoverage(150)).toBe(null);
  });

  it("collectGraphEdgeKeys uniques by block name", () => {
    expect(
      collectGraphEdgeKeys([
        { block: "login" },
        { block: "logout" },
        { block: "login" },
      ]),
    ).toEqual(["login", "logout"]);
  });

  it("normalizeHitKey maps instance hits onto graph blocks", () => {
    const g = new Set(["add-to-cart", "login"]);
    expect(normalizeHitKey("add-to-cart::sku-1", g)).toBe("add-to-cart");
    expect(normalizeHitKey("login", g)).toBe("login");
    expect(normalizeHitKey("unknown::x", g)).toBe(null);
  });

  it("buildCoverageReport computes ratio + gate", () => {
    const report = buildCoverageReport({
      projectDir: "/tmp/demo",
      parallel: 1,
      allEdgeKeys: ["a", "b", "c", "d"],
      hitKeys: ["a", "b::1", "orphan"],
      minEdgeCoverage: 0.5,
    });
    expect(report.edgesTotal).toBe(4);
    expect(report.edgesHit).toBe(2);
    expect(report.ratio).toBe(0.5);
    expect(report.hit).toEqual(["a", "b"]);
    expect(report.missed).toEqual(["c", "d"]);
    expect(report.coveragePass).toBe(true);
    expect(formatCoverageLine(report)).toContain("min=50.0% PASS");
  });

  it("coverage gate fails when ratio below min", () => {
    const report = buildCoverageReport({
      projectDir: "/tmp/demo",
      parallel: 2,
      allEdgeKeys: ["a", "b", "c", "d"],
      hitKeys: ["a"],
      minEdgeCoverage: 0.8,
    });
    expect(report.coveragePass).toBe(false);
    expect(formatCoverageLine(report)).toMatch(/FAIL/);
  });
});
