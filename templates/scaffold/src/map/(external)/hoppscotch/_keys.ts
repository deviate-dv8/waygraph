import { key, keyGroup } from "waygraph";

export const RequestMethod = key<string>("hoppscotch.requestMethod");
export const RequestUrl = key<string>("hoppscotch.requestUrl");
export const RequestHeaders = key<Record<string, string>>("hoppscotch.requestHeaders");
export const RequestParams = key<Record<string, string>>("hoppscotch.requestParams");
export const RequestBearerToken = key<string>("hoppscotch.requestBearerToken");

/** Raw JSON text typed into the request body editor. */
export const RequestBody = key<string>("hoppscotch.requestBody");
export const ExpectedStatus = key<number>("hoppscotch.expectedStatus");

/** Substring the response body must contain. */
export const ExpectedResponseText = key<string>("hoppscotch.expectedResponseText");

/** The raw response body, set by read-response-body. */
export const ResponseBody = key<string>("hoppscotch.responseBody");

/** Response headers (lower-cased names), set by read-response-headers. */
export const ResponseHeaders = key<Record<string, string>>("hoppscotch.responseHeaders");
export const ExpectedResponseHeader = keyGroup<{ name: string; value: string }>("hoppscotch.expectedResponseHeader");
