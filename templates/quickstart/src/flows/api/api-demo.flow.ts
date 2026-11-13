import { checkpoint, defineApiBlock } from "waygraph";
import { engine } from "../../../config/waygraph.config.js";
import { loginFlow } from "../auth/login.flow.js";

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
export const BackendHealthy = checkpoint("BackendHealthy");
export type BackendHealthy = typeof BackendHealthy;
export const BackendDown = checkpoint("BackendDown");
export type BackendDown = typeof BackendDown;

const CheckBackendHealth = defineApiBlock({
  name: "check-backend-health",
  to: [BackendHealthy, BackendDown],
  call: ({ request }) =>
    request.get("https://jsonplaceholder.typicode.com/todos/1"),
  resolve: (result) => (result.ok ? BackendHealthy : BackendDown),
});

export const apiDemoEpisode = engine
  .map({ title: "Backend health check", description: "A real HTTP request, no browser: resolves to healthy or down." })
  .method(
    CheckBackendHealth.stubBefore((ctx) => {
      ctx.ui.title("Checking backend health · real HTTP request, no browser");
    }),
  );

export const apiDemoFlow = engine
  .map({ title: "Sign in, then check the backend", description: "A real HTTP check after the UI login, resolved into a Checkpoint like a UI step.", labels: ["api"], memStub: true })
  .flow(loginFlow)
  .flow(apiDemoEpisode);
