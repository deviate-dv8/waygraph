// A recorded demo's voice-over: the lines it speaks, one after another, each placed at the moment it starts on the
// recording. The demo waits for a line to finish (settle) before it moves on, so the voice is never cut off.
import { setTimeout as sleep } from "node:timers/promises";
import { messageOf } from "../engine/errors.js";
import { speak, type PlacedLine, type Voice } from "../runtime/voice.js";
import type { WgPage } from "./types.js";

declare module "playwright-core" {
  interface Page {
    /** The voice-over of a recorded demo with a voice: the overlay speaks each new caption through it. */
    __wgVoice?: VoiceOver | undefined;
  }
}

export class VoiceOver {
  /** Every line spoken so far, in order. */
  readonly lines: PlacedLine[] = [];
  /** When the line playing now ends (ms since the epoch). */
  private endsAt = 0;
  /** The line last asked for: a repaint asking again doesn't repeat it. */
  private last = "";
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly voice: Voice,
    private readonly cacheDir: string,
    /** When the recording started (ms since the epoch): a line's place is its start, from here. */
    private readonly startedAt: number,
    /** Whether each step's description is spoken too, not only captions and slides. */
    readonly steps: boolean,
  ) {}

  /**
   * Speaks `text` after the line before it ends. Resolves once it has started (its audio is made, or read from the
   * cache, first); {@link settle} waits for it to end. A line that fails to synthesize is skipped, saying why.
   */
  say(text: string): Promise<void> {
    const line = text.replace(/\s+/g, " ").trim();
    if (!line || line === this.last) return this.queue;
    this.last = line;
    this.queue = this.queue.then(async () => {
      try {
        const spoken = await speak(this.voice, line, this.cacheDir);
        await this.quiet();
        const now = Date.now();
        this.lines.push({ ...spoken, text: line, atMs: now - this.startedAt });
        this.endsAt = now + spoken.ms;
      } catch (err) {
        console.error(`waygraph voice: skipped "${line.slice(0, 60)}": ${messageOf(err)}`);
      }
    });
    return this.queue;
  }

  /** Waits until every line asked for so far has been spoken to its end. */
  async settle(): Promise<void> {
    await this.queue;
    await this.quiet();
  }

  /** Waits until the line playing now ends. */
  private async quiet(): Promise<void> {
    const left = this.endsAt - Date.now();
    if (left > 0) await sleep(left);
  }
}

/** The page's voice-over, when the demo records one. */
export function voiceOf(page: WgPage): VoiceOver | undefined {
  return page.__wgVoice;
}
