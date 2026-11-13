// After a step's verify: what the page shows, kept in the run log (`step:read`) and on the run's trail for a later step to ask.
import type { Page } from "@playwright/test";
import { messageOf } from "../errors.js";
import type { MemPage } from "../mem/mem.js";
import { readBlocksFor, readCheckpoint } from "../read/read-block.js";
import { currentStep, stepRead } from "./events.js";

/** After a step's verify: what the page shows, from the Read Blocks for where it landed (none loaded: nothing to do). */
export async function readLanding(page: Page, mem: MemPage, checkpoint: string): Promise<void> {
  if (readBlocksFor(checkpoint).length === 0) return;
  try {
    const { read, blocks } = await readCheckpoint(page, mem, checkpoint);
    stepRead(checkpoint, { read: read.toJSON(), missing: [...read.missing], notes: { ...read.notes }, readBlocks: blocks });
    const step = currentStep();
    if (step) mem.trail.add({ step: step.index, block: step.block, page: checkpoint, ...(step.pane ? { pane: step.pane } : {}), read });
  } catch (err) {
    // A broken Read Block is reported on the step, never fails the run it observes.
    stepRead(checkpoint, { read: {}, missing: [], notes: {}, readBlocks: [], error: messageOf(err) });
  }
}

