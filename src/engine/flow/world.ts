// The world a flow runs in: its time zone, the network's speed, requests that fail or are slow on purpose
// (`map({ timezone, network })`). Applied when the flow starts, undone when it ends - pass or fail - so a flow that
// tests an outage doesn't leave the next one offline.
import type { CDPSession, Page, Route } from "@playwright/test";
import type { SomeDefinedBlock } from "../block/block.js";
import { copyWaygraphRuntime } from "../block/block.js";
import { defineMethodBlock } from "../block/kinds/method.js";
import { checkpoint, type Checkpoint } from "../checkpoint/checkpoint.js";
import type { MemPage } from "../mem/mem.js";

/** Network speed: a preset, or latency and throughput. */
export type Throttle = "offline" | "slow-3g" | "fast-3g" | { latencyMs: number; downloadKbps: number; uploadKbps: number };

/** A request that goes wrong on purpose: `url` is a glob (`**\/api/orders`). Answer with `status`, `abort`, or `delayMs` first. */
export interface Fault {
  url: string;
  /** Answer with this status (and `body`) instead of reaching the server. */
  status?: number;
  body?: string;
  /** Fail the request as a network error. */
  abort?: boolean;
  /** Hold the request this long, then let it through (or answer as above). */
  delayMs?: number;
}

/** What `map({ timezone, network })` sets for a flow. */
export interface World {
  /** An IANA time zone (`"Asia/Tokyo"`): the page's clock and dates run in it. Chromium. */
  timezone?: string;
  network?: {
      /** `"offline"` in every browser; the speeds in Chromium. */
    throttle?: Throttle;
    faults?: readonly Fault[];
  };
}

const PRESETS: Record<Exclude<Throttle, object | "offline">, { offline: boolean; latency: number; downloadThroughput: number; uploadThroughput: number }> = {
  "slow-3g": { offline: false, latency: 2000, downloadThroughput: (500 * 1024) / 8, uploadThroughput: (500 * 1024) / 8 },
  "fast-3g": { offline: false, latency: 560, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 },
};
const NORMAL = { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 };

/**
 * Chromium's DevTools session for a page: time zone and throttling exist only there. One per page, kept: an override
 * belongs to the session that set it, so the session that undoes it must be the same one.
 */
const sessions = new WeakMap<Page, CDPSession>();
async function devtools(page: Page, what: string): Promise<CDPSession> {
  let cdp = sessions.get(page);
  if (cdp) return cdp;
  try {
    cdp = await page.context().newCDPSession(page);
  } catch {
    throw new Error(`waygraph: map({ ${what} }) needs Chromium (it uses the DevTools protocol)`);
  }
  sessions.set(page, cdp);
  return cdp;
}

/** The routes a page's current world added, to take off again. */
const routes = new WeakMap<Page, { url: string; handler: (route: Route) => Promise<void> }[]>();

async function apply(page: Page, world: World): Promise<void> {
  if (world.timezone) await (await devtools(page, "timezone")).send("Emulation.setTimezoneOverride", { timezoneId: world.timezone });
  const throttle = world.network?.throttle;
  // Offline is Playwright's own switch (every browser); speeds are Chromium's network emulation.
  if (throttle === "offline") await page.context().setOffline(true);
  else if (throttle) {
    const cdp = await devtools(page, "network: { throttle }");
    await cdp.send("Network.enable");
    await cdp.send(
      "Network.emulateNetworkConditions",
      typeof throttle === "string"
        ? PRESETS[throttle]
        : { offline: false, latency: throttle.latencyMs, downloadThroughput: (throttle.downloadKbps * 1024) / 8, uploadThroughput: (throttle.uploadKbps * 1024) / 8 },
    );
  }
  const added = [];
  for (const fault of world.network?.faults ?? []) {
    const handler = async (route: Route): Promise<void> => {
      if (fault.delayMs) await new Promise((r) => setTimeout(r, fault.delayMs));
      if (fault.abort) return route.abort("failed");
      if (fault.status !== undefined) return route.fulfill({ status: fault.status, body: fault.body ?? "" });
      return route.continue();
    };
    await page.route(fault.url, handler);
    added.push({ url: fault.url, handler });
  }
  routes.set(page, added);
}

async function undo(page: Page, world: World): Promise<void> {
  for (const { url, handler } of routes.get(page) ?? []) await page.unroute(url, handler);
  routes.delete(page);
  if (world.network?.throttle === "offline") await page.context().setOffline(false);
  else if (world.network?.throttle) await (await devtools(page, "network: { throttle }")).send("Network.emulateNetworkConditions", NORMAL);
  if (world.timezone) await (await devtools(page, "timezone")).send("Emulation.setTimezoneOverride", { timezoneId: "" });
  // Detaching ends whatever the session still overrides.
  await sessions.get(page)?.detach();
  sessions.delete(page);
}

/** The flow's first step, setting its world before it acts. */
export function inWorld(block: SomeDefinedBlock, world: World): SomeDefinedBlock {
  const act = block.instruction.act as (p: Page, i: Checkpoint<string>, m: MemPage) => unknown;
  const next = {
    ...block,
    instruction: {
      ...block.instruction,
      async act(page: Page, input: Checkpoint<string>, mem: MemPage) {
        await apply(page, world);
        return act.call(block.instruction, page, input, mem);
      },
    },
  } as SomeDefinedBlock;
  copyWaygraphRuntime(block, next);
  return next;
}

/** The cleanup step that puts the world back (a `.finally` step: it runs whether the flow passed or failed). */
export function restoreWorld(world: World): SomeDefinedBlock {
  return defineMethodBlock<Checkpoint<string>, Checkpoint<string>>({
    name: "restore-world",
    description: "Puts the time zone and network back as they were before this flow.",
    to: checkpoint("*"),
    instruction: { act: (page) => undo(page, world) },
  }) as unknown as SomeDefinedBlock;
}
