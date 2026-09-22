import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EdgeLeaseCoordinator } from "../../src/traverse-lease.js";

describe("EdgeLeaseCoordinator (Phase D)", () => {
  it("tryClaim is exclusive per edge", () => {
    const leases = new EdgeLeaseCoordinator();
    assert.equal(leases.tryClaim("login", "traverse-1"), true);
    assert.equal(leases.tryClaim("login", "traverse-2"), false);
    assert.equal(leases.tryClaim("login", "traverse-1"), true);
    leases.release("login", "traverse-1");
    assert.equal(leases.tryClaim("login", "traverse-2"), true);
  });

  it("partitionIndex is stable and covers 0..N-1", () => {
    const seen = new Set<number>();
    for (const key of ["a", "b", "c", "nav-x", "add-to-cart::1", "add-to-cart::2"]) {
      const i = EdgeLeaseCoordinator.partitionIndex(key, 3);
      assert.ok(i >= 0);
      assert.ok(i < 3);
      seen.add(i);
      assert.equal(EdgeLeaseCoordinator.partitionIndex(key, 3), i);
    }
    assert.ok(seen.size > 1);
  });
});
