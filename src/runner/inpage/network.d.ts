/** In-page installer (page.evaluate target) - see network.js's own header. */
export interface NetworkEntry {
  method: string;
  url: string;
  status: number;
  ok: boolean;
  ms?: number | undefined;
  reqHeaders?: Record<string, string> | undefined;
  resHeaders?: Record<string, string> | undefined;
  reqBody?: string | undefined;
  resBody?: string | undefined;
}
export function addNetworkEntry(entry: NetworkEntry): void;
export function clearNetworkLog(): void;
