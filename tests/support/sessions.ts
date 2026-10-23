// Detached browser sessions a test started, stopped after each test even when it fails (a failing test never reaches
// its own "q"). Per worker: parallel workers share project folders, so nothing here touches another worker's sessions.
import { test } from "@playwright/test";
import { stopBrowserSession } from "../../src/live/auto-session-ipc.js";

const started: { projectDir: string; sessionId: string }[] = [];

/** Stops this session after the current test. */
export function trackSession(projectDir: string, sessionId: string): void {
  started.push({ projectDir, sessionId });
}

/** Call once per spec file that starts detached sessions. */
export function stopSessionsAfterEachTest(): void {
  test.afterEach(() => {
    for (const s of started.splice(0)) stopBrowserSession(s.projectDir, s.sessionId);
  });
}
