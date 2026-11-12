// What an HTTP call is called: its status in words, its route with the ids folded, and its headers and body with the
// secrets masked. Pure, so the run log, the demo and Waygraph Studio say the same thing.

const WORDS: Record<number, string> = {
  200: "OK", 201: "Created", 202: "Accepted", 204: "No Content", 301: "Moved Permanently", 302: "Found", 304: "Not Modified",
  400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed", 408: "Request Timeout",
  409: "Conflict", 410: "Gone", 413: "Payload Too Large", 415: "Unsupported Media Type", 422: "Unprocessable Entity", 429: "Too Many Requests",
  500: "Internal Server Error", 501: "Not Implemented", 502: "Bad Gateway", 503: "Service Unavailable", 504: "Gateway Timeout",
};

/** `201 Created`; `0` is a call that got no answer. */
export function statusWords(status: number): string {
  if (status === 0) return "No response";
  return WORDS[status] ? `${status} ${WORDS[status]}` : `${status}`;
}

/** What a status tells the reader about the call, the line a reader needs beside it. */
export function statusWhy(status: number, method = "GET"): string {
  if (status === 0) return "The request never got an answer (the server was down, the connection dropped, or the call was blocked).";
  if (status === 401) return "The server doesn't know who is calling: the session or token is missing or expired.";
  if (status === 403) return "The server knows who is calling, and that account isn't allowed to.";
  if (status === 404) return "Nothing lives at this address (or the id in it doesn't exist).";
  if (status === 409) return "The change collides with what the server already has.";
  if (status === 422 || status === 400) return "The server rejected what was sent: see the request body against the response's message.";
  if (status === 429) return "Too many calls in a short time: the server is rate limiting.";
  if (status === 304) return "Nothing changed since the last time: the server told the client to reuse what it has.";
  if (status === 201) return "The server made what was asked.";
  if (status === 204) return `The ${method} worked and there is nothing to send back.`;
  if (status >= 200 && status < 300) return "The call worked.";
  if (status >= 300 && status < 400) return "The server pointed to another address.";
  if (status >= 500) return "The server failed while handling a valid-looking request: a bug or an outage on their side.";
  return "The server refused the call.";
}

/** The path of `url` with each id folded: `/posts/12` and `/users/3f2a…/orders` become `/posts/:id` and `/users/:id/orders`. */
export function routeOf(url: string): string {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    path = url.split("?")[0] ?? url;
  }
  return path.replace(/\/(\d+|[0-9a-f]{8}-[0-9a-f-]{27}|[0-9a-f]{24,})(?=\/|$)/gi, "/:id") || "/";
}

/** `GET /posts/:id`: a call as a person names it. */
export const callName = (method: string, url: string): string => `${method.toUpperCase()} ${routeOf(url)}`;

const SECRET_HEADER = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|x-auth-token|x-csrf-token)$/i;
const SECRET_FIELD = /pass(word|wd)?|token|secret|authorization|api[-_]?key|credential|session/i;
export const MASKED = "••••";

/** Headers with the ones that carry a credential masked. */
export function maskHeaders(headers: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!headers) return undefined;
  return Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, SECRET_HEADER.test(k) ? MASKED : v]));
}

function maskValue(value: unknown, depth: number): unknown {
  if (depth > 8 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => maskValue(v, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SECRET_FIELD.test(k) && typeof v !== "object" ? MASKED : maskValue(v, depth + 1)]));
}

/** A body as the run log keeps it: JSON parsed, the fields named like a credential masked; text as it is (form posts masked by field). */
export function maskBody(text: string | undefined, contentType = ""): unknown {
  if (text === undefined || text === "") return undefined;
  if (/json/i.test(contentType) || /^\s*[[{]/.test(text)) {
    try {
      return maskValue(JSON.parse(text), 0);
    } catch {
      /* not JSON after all: kept as text */
    }
  }
  if (/x-www-form-urlencoded/i.test(contentType)) {
    return text.split("&").map((pair) => {
      const [k = "", v = ""] = pair.split("=");
      return SECRET_FIELD.test(decodeURIComponent(k)) ? `${k}=${MASKED}` : `${k}=${v}`;
    }).join("&");
  }
  return text;
}
