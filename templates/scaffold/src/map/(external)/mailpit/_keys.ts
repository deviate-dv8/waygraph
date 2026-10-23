import { key, keyGroup } from "waygraph";

/** The link read out of the opened message - set by extract-email-link. */
export const EmailLink = keyGroup<{ url: string }>("mailpit.emailLink");

/** Matched by email, not inbox position, so one inbox can hold several recipients' mail. */
export const ExpectedRecipient = keyGroup<{ email: string }>("mailpit.expectedRecipient");

/** Substring the link's `href` must contain; mem varies per scenario, the Blocks do not. */
export const ExpectedLinkPattern = key<string>("mailpit.expectedLinkPattern");

/** Substring the open message's body must contain. */
export const ExpectedEmailContent = key<string>("mailpit.expectedEmailContent");
