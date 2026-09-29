/** In-page installer (page.evaluate target) - see network.js's own header. */
export function showNetworkEntry(args: {
  url: string;
  status: number;
  ok: boolean;
  ms?: number | undefined;
}): void;
