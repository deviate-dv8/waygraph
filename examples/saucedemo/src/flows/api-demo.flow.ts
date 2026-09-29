import { Engine, start, end, withTitle, chainFlow, checkpoint, defineApiBlock } from "waygraph";
import type { Checkpoint, StubCtx } from "waygraph";
import { loginFlow } from "./login.flow.js";

/**
 * Proof of concept for FE+BE in one Flow: a real backend check
 * (defineApiBlock, Playwright's own page.request - no browser, no curl
 * shell-out) resolved into a Checkpoint exactly like a UI Block, chained
 * right after the UI login. This is the QA-team ask: show a mixed
 * frontend + backend journey narrated as one state machine, not two
 * separate test files with no shared story.
 *
 * saucedemo.com is a static demo site with no backend of its own, so this
 * hits a well-known public REST test API (jsonplaceholder) purely to prove
 * the mechanism - a real project would point `call` at its own backend.
 */
export type BackendHealthy = Checkpoint<"BackendHealthy">;
export type BackendDown = Checkpoint<"BackendDown">;

const engine = new Engine();

const CheckBackendHealth = defineApiBlock<any, BackendHealthy | BackendDown>({
  name: "check-backend-health",
  call: ({ request }) => request.get("https://jsonplaceholder.typicode.com/todos/1"),
  resolve: (result) => (result.ok ? checkpoint("BackendHealthy") : checkpoint("BackendDown")),
  stubBefore: (ctx: StubCtx<BackendHealthy | BackendDown>) => {
    ctx.title("Checking backend health · real HTTP request, no browser");
  },
});

export const apiDemoEpisode = withTitle(
  engine.defineFlow([start, CheckBackendHealth, end]),
  "Backend health check (defineApiBlock)",
);

/** Full demo: Sign In (FE) -> backend health check (BE), one narrated Flow. */
export const apiDemoFlow = chainFlow(loginFlow, apiDemoEpisode);
