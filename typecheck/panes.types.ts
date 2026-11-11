// Panes: each pane keeps its own page, so a step is checked against where its pane is, not where the last step was.
import { defineNavBlock } from "../src/engine/block/kinds/nav.js";
import { defineMethodBlock } from "../src/engine/block/kinds/method.js";
import { checkpoint } from "../src/engine/checkpoint/checkpoint.js";
import { map } from "../src/engine/engine.js";

const Registry = checkpoint("Registry");
const Requests = checkpoint("Requests");
const NavRegistry = defineNavBlock({ name: "nav-registry", checkpoint: Registry, url: "/registry" });
const NavRequests = defineNavBlock({ name: "nav-requests", checkpoint: Requests, url: "/requests" });
const RequestRepair = defineMethodBlock({ name: "request-repair", from: Registry, to: Registry, instruction: { async act() {} } });
const Approve = defineMethodBlock({ name: "approve", from: Requests, to: Requests, instruction: { async act() {} } });

const panes = { planner: {}, admin: {} };

// Back in the planner's pane, the step is checked against where the planner was (Registry), not the admin (Requests).
map({ panes })
  .in("planner").gotoPage(NavRegistry).method(RequestRepair)
  .in("admin").gotoPage(NavRequests).method(Approve)
  .in("planner").method(RequestRepair);

map({ panes })
  .in("planner").gotoPage(NavRegistry)
  .in("admin").gotoPage(NavRequests)
  // @ts-expect-error - the planner is on Registry: Approve starts on Requests
  .in("planner").method(Approve);

// @ts-expect-error - "viewer" isn't one of the flow's panes
map({ panes }).in("viewer");

// A flow without panes has no pane to name.
// @ts-expect-error - no panes declared
map().in("planner");

// A flow closes another pane, not the one it's in.
map({ panes })
  .in("planner").gotoPage(NavRegistry)
  // @ts-expect-error - the flow is in the planner's pane
  .close("planner");
map({ panes }).in("planner").gotoPage(NavRegistry).close("admin").method(RequestRepair);
