import { checkpoint } from "waygraph";

/** Mailpit inbox UI reached; message list visible. */
export const MailpitInbox = checkpoint("MailpitInbox");
export type MailpitInbox = typeof MailpitInbox;

/** The message addressed to the expected recipient is open; preview iframe visible. */
export const MailpitMessageOpen = checkpoint("MailpitMessageOpen");
export type MailpitMessageOpen = typeof MailpitMessageOpen;
