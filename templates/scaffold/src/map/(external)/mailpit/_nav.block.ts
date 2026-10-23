import { defineNavBlock, Trait } from "waygraph";
import { MailpitInbox } from "./_states.js";

// Cross-origin, so it lives under (external)/ and the URL is a function.
const mailpitUrl = (): string => process.env.WAYGRAPH_MAIL_URL ?? "http://127.0.0.1:8025";

export const NavMailpitInboxBlock = defineNavBlock({
  name: "nav-mailpit-inbox",
  checkpoint: MailpitInbox,
  url: mailpitUrl,
  verify: [Trait.url({ pathname: "/" })],
});
