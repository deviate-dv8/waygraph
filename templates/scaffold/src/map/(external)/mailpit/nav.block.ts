import { defineNavBlock, Trait } from "waygraph";
import type { MailpitInbox } from "../../../states/demo.states.js";

/**
 * Kind: Nav
 * Helper: defineNavBlock
 * Route: (external)/mailpit/  (cross-origin - a real Mailpit web UI, not this app)
 *
 * Cross-origin tooling lives under (external)/, never (app_base)/ - this is
 * a dev-inbox screen, not part of the app under test. `WAYGRAPH_MAIL_URL`
 * defaults to Mailpit's own usual local port.
 */
const mailpitUrl = (): string => process.env.WAYGRAPH_MAIL_URL ?? "http://127.0.0.1:8025";

export const NavMailpitInboxBlock = defineNavBlock<MailpitInbox>({
  name: "nav-mailpit-inbox",
  checkpoint: "MailpitInbox",
  url: mailpitUrl,
  verify: [Trait.url({ pathname: "/" })],
});
