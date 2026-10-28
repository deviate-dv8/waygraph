import { reads } from "waygraph";

/** What the Mailpit inbox shows: one line of text per message, newest first. */
export const MailpitRead = reads("mailpit")<{ messages: string[] }>();
