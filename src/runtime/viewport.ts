// A viewport size written as text: "1920x1080" or "1920,1080" (WAYGRAPH_VIDEO_VIEWPORT, --video-viewport, the config).

/** The size, or null when it isn't one (or is outside 320x240 .. 7680x4320). */
export function parseViewport(raw: string | undefined): { width: number; height: number } | null {
  const m = raw?.trim().match(/^(\d{3,5})[xX,](\d{3,5})$/);
  if (!m) return null;
  const width = Number(m[1]);
  const height = Number(m[2]);
  if (width < 320 || height < 240 || width > 7680 || height > 4320) return null;
  return { width, height };
}
