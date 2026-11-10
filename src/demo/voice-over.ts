// A recorded demo's voice-over: the lines it speaks, one after another, each placed at the moment it starts on the
// recording. The demo waits for a line to finish (settle) before it moves on, so the voice is never cut off.
import { setTimeout as sleep } from "node:timers/promises";
import { messageOf } from "../engine/errors.js";
import { speak, type PlacedLine, type Spoken, type Voice } from "../runtime/voice.js";
import type { WgPage } from "./types.js";

declare module "playwright-core" {
  interface Page {
    /** The voice-over of a recorded demo with a voice: the overlay speaks each new caption through it. */
    __wgVoice?: VoiceOver | undefined;
  }
}

/** A breath after each line, before the next one starts or the demo moves on. */
const BREATH_MS = 350;

export class VoiceOver {
  /** Every line spoken so far, in order. */
  readonly lines: PlacedLine[] = [];
  /** When the line playing now ends (ms since the epoch). */
  private endsAt = 0;
  /** The line last asked for: a repaint asking again doesn't repeat it. */
  private last = "";
  private queue: Promise<void> = Promise.resolve();
  /** Lines being made now (said, or made ahead), so one isn't made twice. */
  private readonly making = new Map<string, Promise<Spoken>>();

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
        const spoken = await this.made(line);
        await this.quiet();
        const now = Date.now();
        this.lines.push({ ...spoken, text: line, atMs: now - this.startedAt });
        this.endsAt = now + spoken.ms + BREATH_MS;
      } catch (err) {
        console.error(`waygraph voice: skipped "${line.slice(0, 60)}": ${messageOf(err)}`);
      }
    });
    return this.queue;
  }

  /**
   * Makes lines ahead, in the background (the steps' descriptions, known before the demo starts), so the recording
   * doesn't wait while a voice makes them the first time. A line that fails is made again, and reported, when said.
   */
  prepare(texts: readonly string[]): void {
    // One at a time: a line the demo says meanwhile waits for one of these at most, not for all of them.
    void (async () => {
      for (const text of texts) {
        const line = text.replace(/\s+/g, " ").trim();
        if (!line) continue;
        await this.made(line).catch(() => this.making.delete(line));
      }
    })();
  }

  /** Stops the voice's own process, if it keeps one (a model loaded once). */
  async close(): Promise<void> {
    await this.voice.close?.();
  }

  /** The line's audio: made once, by whichever asks first. */
  private made(line: string): Promise<Spoken> {
    let pending = this.making.get(line);
    if (!pending) {
      pending = speak(this.voice, line, this.cacheDir);
      this.making.set(line, pending);
    }
    return pending;
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
