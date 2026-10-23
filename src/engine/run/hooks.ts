// Where the demo plugs into the engine without the engine importing it: an API Block reports its call here.
import type { Page } from "@playwright/test";

/** One HTTP call a Block made on its own (`defineApiBlock`), for whatever is showing network activity. */
export interface ApiCallRecord {
  method: string;
  url: string;
  status: number;
  ok: boolean;
  ms: number;
  resHeaders?: Record<string, string> | undefined;
  resBody?: string | undefined;
}

type ApiCallRecorder = (page: Page, entry: ApiCallRecord) => void | Promise<void>;
let apiCallRecorder: ApiCallRecorder | undefined;

/** The demo layer registers how an API call is shown (the network panel). Without one, calls are not recorded. */
export function setApiCallRecorder(recorder: ApiCallRecorder | undefined): void {
  apiCallRecorder = recorder;
}

export async function recordApiCall(page: Page, entry: ApiCallRecord): Promise<void> {
  await apiCallRecorder?.(page, entry);
}
