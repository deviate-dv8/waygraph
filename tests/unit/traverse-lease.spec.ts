import { describe, expect, it } from "vitest";
import { EdgeLeaseCoordinator } from "../../src/traverse-lease.js";

describe("EdgeLeaseCoordinator (Phase D)", () => {
  it("tryClaim is exclusive per edge", () => {
    const leases = new EdgeLeaseCoordinator();
    expect(leases.tryClaim("login", "traverse-1")).toBe(true);
    expect(leases.tryClaim("login", "traverse-2")).toBe(false);
    expect(leases.tryClaim("login", "traverse-1")).toBe(true);
    leases.release("login", "traverse-1");
    expect(leases.tryClaim("login", "traverse-2")).toBe(true);
  });

  it("partitionIndex is stable and covers 0..N-1", () => {
    const seen = new Set<number>();
    for (const key of ["a", "b", "c", "nav-x", "add-to-cart::1", "add-to-cart::2"]) {
      const i = EdgeLeaseCoordinator.partitionIndex(key, 3);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(3);
      seen.add(i);
      expect(EdgeLeaseCoordinator.partitionIndex(key, 3)).toBe(i);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});
