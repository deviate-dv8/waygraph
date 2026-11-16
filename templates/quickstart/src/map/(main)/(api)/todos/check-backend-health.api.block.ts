import { checkpoint, defineApiBlock } from "waygraph";

export const BackendHealthy = checkpoint("BackendHealthy");
export const BackendDown = checkpoint("BackendDown");

/**
 * A backend check as a step: Playwright's own `page.request`, no browser and no curl. saucedemo.com has no backend of its
 * own, so this asks a public REST test API; a real project points `call` at its own.
 */
export const CheckBackendHealth = defineApiBlock({
  name: "check-backend-health",
  description: "A real HTTP request, no browser: resolves to healthy or down.",
  to: [BackendHealthy, BackendDown],
  call: ({ request }) => request.get("https://jsonplaceholder.typicode.com/todos/1"),
  resolve: (result) => (result.ok ? BackendHealthy : BackendDown),
});
