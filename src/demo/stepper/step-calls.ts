// The HTTP calls a demo step made, for its outcome card: collected from the run's call recorder, turned into what the card
// and the call modal show (status in words, why, bodies as text, a cURL), and handed over once the step's calls are in.
import { overlayHides } from "../overlay/hidden.js";
import { envString } from "../../engine/env.js";
import { callName, statusWhy, statusWords } from "../../engine/run/call-words.js";
import { callsIdle, onCallDetail, type CallBodies, type CallDetail } from "../../engine/run/calls.js";
import type { CallView } from "../overlay/inpage/call-modal.js";

/** What a step's card shows: the app's own calls, and how many went to other origins. */
export interface StepCalls {
  shown: CallView[];
  leftOut: number;
}

/** A body longer than this is cut on the card (the run log's artifact keeps it whole). */
const MAX_TEXT = 6000;

let pending: CallDetail[] = [];
let listening = false;

const asText = (value: unknown): string | undefined => {
  if (value === undefined) return undefined;
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n… (${text.length - MAX_TEXT} more characters)` : text;
};

const flat = (headers: Record<string, string> | undefined): Record<string, string> => ({ ...(headers ?? {}) });

function curlOf(method: string, url: string, bodies: CallBodies): string {
  const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
  let cmd = `curl -X ${method} ${q(url)}`;
  for (const [k, v] of Object.entries(bodies.request.headers ?? {})) if (!k.startsWith(":")) cmd += ` \\\n  -H ${q(`${k}: ${v}`)}`;
  const body = asText(bodies.request.body);
  if (body) cmd += ` \\\n  --data ${q(body)}`;
  return cmd;
}

/** The config's name for a call (`network.names`), else `GET /posts/:id`. */
function nameOf(method: string, url: string): string {
  const plain = callName(method, url);
  try {
    return (JSON.parse(envString("WAYGRAPH_CALL_NAMES") ?? "{}") as Record<string, string>)[plain] ?? plain;
  } catch {
    return plain;
  }
}

export function viewOf({ summary: s, bodies }: CallDetail): CallView {
  return {
    name: nameOf(s.method, s.url),
    method: s.method,
    url: s.url,
    words: statusWords(s.status),
    status: s.status,
    why: statusWhy(s.status, s.method),
    ms: s.ms,
    ...(s.size !== undefined ? { size: s.size } : {}),
    failed: s.failed,
    source: s.source,
    ...(s.cacheable ? { cacheable: true } : {}),
    reqHeaders: flat(bodies.request.headers),
    ...(asText(bodies.request.body) !== undefined ? { reqBody: asText(bodies.request.body) ?? "" } : {}),
    resHeaders: flat(bodies.response.headers),
    ...(asText(bodies.response.body) !== undefined ? { resBody: asText(bodies.response.body) ?? "" } : {}),
    curl: curlOf(s.method, s.url, bodies),
  };
}

/** A step is about to run: collects calls (the listener once per process) from here; {@link takeStepCalls} hands them over. */
export function startStepCalls(): void {
  pending = [];
  if (listening) return;
  listening = true;
  onCallDetail((detail) => void pending.push(detail));
}

/** The calls made since the last step's card, once the ones in flight are in. */
export async function takeStepCalls(): Promise<StepCalls> {
  if (overlayHides("calls")) return { shown: [], leftOut: 0 };
  await callsIdle(800);
  const calls = pending;
  pending = [];
  const own = calls.filter((c) => !c.summary.external);
  return { shown: own.map(viewOf), leftOut: calls.length - own.length };
}
