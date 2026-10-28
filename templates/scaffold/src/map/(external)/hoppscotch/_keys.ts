import { keys } from "waygraph";

export const HoppscotchKeys = keys("hoppscotch")<{
  requestMethod: string;
  requestUrl: string;
  requestHeaders: Record<string, string>;
  requestParams: Record<string, string>;
  requestBearerToken: string;
  /** Raw JSON text typed into the request body editor. */
  requestBody: string;
  expectedStatus: number;
  /** Substring the response body must contain. */
  expectedResponseText: string;
  /** The raw response body, set by read-response-body. */
  responseBody: string;
  /** Response headers (lower-cased names), set by read-response-headers. */
  responseHeaders: Record<string, string>;
  expectedResponseHeader: { name: string; value: string };
}>();
