// Panes: each pane keeps its own page, so a step is checked against where its pane is, not where the last step was.
import { defineNavBlock } from "../src/engine/block/kinds/nav.js";
import { defineMethodBlock } from "../src/engine/block/kinds/method.js";
import { checkpoint } from "../src/engine/checkpoint/checkpoint.js";
import { map } from "../src/engine/engine.js";
import { pane } from "../src/engine/flow/panes.js";

const Registry = checkpoint("Registry");
const Requests = checkpoint("Requests");
const NavRegistry = defineNavBlock({ name: "nav-registry", checkpoint: Registry, url: "/registry" });
const NavRequests = defineNavBlock({ name: "nav-requests", checkpoint: Requests, url: "/requests" });
const RequestRepair = defineMethodBlock({ name: "request-repair", from: Registry, to: Registry, instruction: { async act() {} } });
const Approve = defineMethodBlock({ name: "approve", from: Requests, to: Requests, instruction: { async act() {} } });

const Planner = pane("planner");
const Admin = pane("admin");
const Viewer = pane("viewer");
const panes = [Planner, Admin];

// Back in the planner's pane, the step is checked against where the planner was (Registry), not the admin (Requests).
map({ panes })
  .in(Planner).gotoPage(NavRegistry).method(RequestRepair)
  .in(Admin).gotoPage(NavRequests).method(Approve)
  .in(Planner).method(RequestRepair);

map({ panes })
  .in(Planner).gotoPage(NavRegistry)
  .in(Admin).gotoPage(NavRequests)
  // @ts-expect-error - the planner is on Registry: Approve starts on Requests
  .in(Planner).method(Approve);

// @ts-expect-error - "viewer" isn't one of the flow's panes
map({ panes }).in(Viewer);

// A flow without panes has no pane to name.
// @ts-expect-error - no panes declared
map().in(Planner);

// A flow closes another pane, not the one it's in.
map({ panes })
  .in(Planner).gotoPage(NavRegistry)
  // @ts-expect-error - the flow is in the planner's pane
  .close(Planner);
map({ panes }).in(Planner).gotoPage(NavRegistry).close(Admin).method(RequestRepair);
