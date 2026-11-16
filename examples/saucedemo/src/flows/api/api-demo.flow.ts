import { engine } from "../../../config/waygraph.config.js";
import { CheckBackendHealth } from "../../map/(main)/(api)/todos/check-backend-health.api.block.js";
import { loginFlow } from "../auth/login.flow.js";

const apiDemoEpisode = engine
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
