/**
 * Phase D: edge leases so parallel traverse workers never claim the same edge.
 * In-process Map is authoritative for `--parallel` (same Node process).
 * Optional JSON under `.waygraph-traverse/` is an audit trail only.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface EdgeLeaseRecord {
  workerId: string;
  claimedAt: number;
}

export class EdgeLeaseCoordinator {
  private readonly held = new Map<string, EdgeLeaseRecord>();
  private readonly dir: string | null;

  constructor(opts?: { projectDir?: string; persist?: boolean }) {
    if (opts?.persist && opts.projectDir) {
      this.dir = join(opts.projectDir, ".waygraph-traverse");
      if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
    } else {
      this.dir = null;
    }
  }

  /** True if this worker now owns `edgeKey` (or already owned it). */
  tryClaim(edgeKey: string, workerId: string): boolean {
    const cur = this.held.get(edgeKey);
    if (cur && cur.workerId !== workerId) return false;
    this.held.set(edgeKey, { workerId, claimedAt: Date.now() });
    this.flush();
    return true;
  }

  release(edgeKey: string, workerId: string): void {
    const cur = this.held.get(edgeKey);
    if (cur && cur.workerId === workerId) {
      this.held.delete(edgeKey);
      this.flush();
    }
  }

  /** Stable partition: same key always maps to the same worker index. */
  static partitionIndex(edgeKey: string, parallel: number): number {
    if (parallel <= 1) return 0;
    let h = 2166136261;
    for (let i = 0; i < edgeKey.length; i++) {
      h ^= edgeKey.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) % parallel;
  }

  private flush(): void {
    if (!this.dir) return;
    try {
      const payload = {
        updatedAt: new Date().toISOString(),
        leases: Object.fromEntries(this.held),
      };
      writeFileSync(join(this.dir, "leases.json"), JSON.stringify(payload, null, 2));
    } catch {
      /* audit only */
    }
  }
}
