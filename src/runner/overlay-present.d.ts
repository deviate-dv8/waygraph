import type { Page } from "@playwright/test";
import type { StubPhaseResult } from "../highlights/types.js";

export interface SessionOverlay {
  present(tag: string, phase: Partial<StubPhaseResult>): Promise<void>;
  restore(): Promise<void>;
}
export function createSessionOverlay(page: Page, surface: string): SessionOverlay;
