import { keys } from "waygraph";

export const MailpitKeys = keys("mailpit")<{
  /** The link read out of the opened message - set by extract-email-link. */
  emailLink: { url: string };
  /** Matched by email, not inbox position, so one inbox can hold several recipients' mail. */
  expectedRecipient: { email: string };
  /** Substring the link's `href` must contain; mem varies per scenario, the Blocks do not. */
  expectedLinkPattern: string;
  /** Substring the open message's body must contain. */
  expectedEmailContent: string;
}>();
