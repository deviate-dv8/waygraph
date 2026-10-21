import { key, keyGroup } from "waygraph";

/** The catalog row `add-item` / `remove-item` act on; `waygraph auto` fills it from `instanceOptions`. */
export const SelectedItem = keyGroup<{ id: string; name: string }>("demo.selectedItem");

/** The link read out of the opened message - set by extract-email-link. */
export const EmailLink = keyGroup<{ url: string }>("demo.emailLink");

/** Matched by email, not inbox position, so one inbox can hold several recipients' mail. */
export const ExpectedRecipient = keyGroup<{ email: string }>("demo.expectedRecipient");

/** Substring the link's `href` must contain; mem varies per scenario, the Blocks do not. */
export const ExpectedLinkPattern = key<string>("demo.expectedLinkPattern");

/** Substring the open message's body must contain. */
export const ExpectedEmailContent = key<string>("demo.expectedEmailContent");

export const RequestMethod = key<string>("demo.requestMethod");
export const RequestUrl = key<string>("demo.requestUrl");
export const RequestHeaders = key<Record<string, string>>("demo.requestHeaders");
export const RequestParams = key<Record<string, string>>("demo.requestParams");
export const RequestBearerToken = key<string>("demo.requestBearerToken");
/** Raw JSON text typed into the request body editor. */
export const RequestBody = key<string>("demo.requestBody");
export const ExpectedStatus = key<number>("demo.expectedStatus");
/** Substring the response body must contain. */
export const ExpectedResponseText = key<string>("demo.expectedResponseText");
/** The raw response body, set by read-response-body. */
export const ResponseBody = key<string>("demo.responseBody");
/** Response headers (lower-cased names), set by read-response-headers. */
export const ResponseHeaders = key<Record<string, string>>("demo.responseHeaders");
export const ExpectedResponseHeader = keyGroup<{ name: string; value: string }>("demo.expectedResponseHeader");
