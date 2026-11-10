// Text to speech for recorded demos: a Voice turns a line into an audio file (a local command, or an OpenAI-compatible
// speech API), lines are cached by voice and text, and a recording gets them as its audio track (ffmpeg) and as
// subtitles (.vtt) beside it.
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/** What speaks a demo's lines: an id (the cache key, with the text), the audio file's extension, and how to make one. */
export interface Voice {
  /** Changes when the voice would sound different: a cached line is reused only for the same id and text. */
  readonly id: string;
  /** `"wav"`, `"mp3"`... what `synthesize` writes. */
  readonly ext: string;
  /** Writes `text`, spoken, to the file `out`. */
  synthesize(text: string, out: string): Promise<void>;
}

/** The arguments of a command template, split like a shell would (quotes group words; nothing is expanded). */
function argvOf(template: string): string[] {
  const args: string[] = [];
  for (const m of template.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)) args.push(m[1] ?? m[2] ?? m[3] ?? "");
  return args;
}

/**
 * A voice from a local text-to-speech command. `{out}` is the file it writes; `{text}` is the line (without it, the
 * line goes to the command's stdin). Run without a shell, so a line can't run anything.
 * @example commandVoice("piper --model en_US-amy-medium.onnx --output_file {out}")   // the line on stdin
 * @example commandVoice("espeak-ng -v en-us -w {out} {text}")
 * @example commandVoice("say -o {out} --data-format=LEI16@22050 {text}", { ext: "wav" }) // macOS
 */
export function commandVoice(command: string, opts: { ext?: string } = {}): Voice {
  const [bin, ...template] = argvOf(command);
  if (!bin) throw new Error("waygraph: commandVoice needs a command, e.g. \"espeak-ng -w {out} {text}\"");
  const viaStdin = !template.some((a) => a.includes("{text}"));
  return {
    id: `command:${command}`,
    ext: opts.ext ?? "wav",
    synthesize: (text, out) =>
      new Promise<void>((resolve, reject) => {
        const args = template.map((a) => a.replaceAll("{out}", out).replaceAll("{text}", text));
        const child = spawn(bin, args, { stdio: [viaStdin ? "pipe" : "ignore", "ignore", "pipe"] });
        let stderr = "";
        child.stderr?.on("data", (d: Buffer) => (stderr += d.toString()));
        child.on("error", (err) => reject(new Error(`waygraph voice: ${bin} didn't start: ${err.message}`)));
        child.on("close", (code) =>
          code === 0 && existsSync(out)
            ? resolve()
            : reject(new Error(`waygraph voice: ${bin} exited ${code}${stderr.trim() ? `: ${stderr.trim().split("\n").pop()}` : ""}`)),
        );
        // A command that exits without reading its stdin closes the pipe: that's its exit code's to report, not a crash.
        child.stdin?.on("error", (err) => (stderr += `\n${err.message}`));
        if (viaStdin && child.stdin) child.stdin.end(text);
      }),
  };
}

/** Settings for {@link openAIVoice}. */
export interface OpenAIVoiceOptions {
  /** Default `"gpt-4o-mini-tts"`. */
  model?: string;
  /** Default `"alloy"`. */
  voice?: string;
  /** How to speak (models that take it): `"Calm, friendly, like a product walkthrough."` */
  instructions?: string;
  /** Default `OPENAI_API_KEY` from the environment (`.env` included). */
  apiKey?: string;
  /** Any OpenAI-compatible speech server (a local one too). Default `https://api.openai.com/v1`. */
  baseURL?: string;
}

/**
 * A voice from an OpenAI-compatible speech API (`POST {baseURL}/audio/speech`): OpenAI's, or a local server that speaks
 * the same API.
 * @example openAIVoice({ voice: "nova", instructions: "Calm and clear." })
 */
export function openAIVoice(opts: OpenAIVoiceOptions = {}): Voice {
  const model = opts.model ?? "gpt-4o-mini-tts";
  const voice = opts.voice ?? "alloy";
  const baseURL = (opts.baseURL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  return {
    id: `openai:${baseURL}:${model}:${voice}:${opts.instructions ?? ""}`,
    ext: "mp3",
    async synthesize(text, out) {
      const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY;
      const response = await fetch(`${baseURL}/audio/speech`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
        body: JSON.stringify({ model, voice, input: text, response_format: "mp3", ...(opts.instructions ? { instructions: opts.instructions } : {}) }),
      });
      if (!response.ok) throw new Error(`waygraph voice: ${baseURL}/audio/speech answered ${response.status}: ${(await response.text()).slice(0, 200)}`);
      writeFileSync(out, Buffer.from(await response.arrayBuffer()));
    },
  };
}

/** A spoken line, ready to place: its audio file and how long it plays. */
export interface Spoken {
  file: string;
  ms: number;
}

/** Whether ffmpeg and ffprobe are on the PATH: measuring a line and adding the audio track need them. */
export async function hasFfmpeg(): Promise<boolean> {
  try {
    await run("ffmpeg", ["-version"]);
    await run("ffprobe", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

/** How long an audio file plays, ms. */
async function audioMs(file: string): Promise<number> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  const seconds = Number(stdout.trim());
  if (!Number.isFinite(seconds)) throw new Error(`waygraph voice: can't tell how long ${file} plays`);
  return Math.round(seconds * 1000);
}

/**
 * A line as it should be heard: arrows read as "to", separators as pauses, runs of spaces as one. What a caption shows
 * stays as written; only what's spoken changes.
 */
export function spokenText(text: string): string {
  return text
    .replace(/\s*(?:->|→|=>)\s*/g, " to ")
    .replace(/\s*[·•|]\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

/** `text` spoken by `voice`: from the cache folder when it was spoken before, else made now and kept there. */
export async function speak(voice: Voice, text: string, cacheDir: string): Promise<Spoken> {
  mkdirSync(cacheDir, { recursive: true });
  const said = spokenText(text);
  const name = createHash("sha256").update(`${voice.id}\n${said}`).digest("hex").slice(0, 20);
  const file = join(cacheDir, `${name}.${voice.ext}`);
  if (!existsSync(file)) {
    const temp = `${file}.${process.pid}.tmp.${voice.ext}`;
    try {
      await voice.synthesize(said, temp);
      renameSync(temp, file);
    } finally {
      rmSync(temp, { force: true });
    }
  }
  return { file, ms: await audioMs(file) };
}

/** A line placed on the recording: when it starts (ms from the recording's start), what it says, and its audio. */
export interface PlacedLine extends Spoken {
  atMs: number;
  text: string;
}

/** `hh:mm:ss.mmm` for WebVTT. */
function vttTime(ms: number): string {
  const t = Math.max(0, Math.round(ms));
  const h = Math.floor(t / 3_600_000);
  const m = Math.floor((t % 3_600_000) / 60_000);
  const s = Math.floor((t % 60_000) / 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(t % 1000, 3)}`;
}

/** The lines as WebVTT subtitles. */
export function subtitlesOf(lines: readonly PlacedLine[]): string {
  return ["WEBVTT", "", ...lines.flatMap((l, i) => [String(i + 1), `${vttTime(l.atMs)} --> ${vttTime(l.atMs + l.ms)}`, l.text, ""])].join("\n");
}

/**
 * Gives `video` its voice-over: each line's audio at its time, mixed into one track, the picture copied as it is. The
 * file is replaced in place (written beside it, then moved over it).
 */
export async function addVoiceOver(video: string, lines: readonly PlacedLine[]): Promise<void> {
  if (!lines.length) return;
  const temp = video.replace(/(\.\w+)$/, `.voiced$1`);
  const inputs = lines.flatMap((l) => ["-i", l.file]);
  const delayed = lines.map((l, i) => `[${i + 1}:a]adelay=${Math.round(l.atMs)}:all=1[a${i}]`);
  const mix = `${lines.map((_l, i) => `[a${i}]`).join("")}amix=inputs=${lines.length}:normalize=0:duration=longest[voice]`;
  const codec = /\.webm$/i.test(video) ? ["-c:a", "libopus", "-b:a", "96k"] : ["-c:a", "aac", "-b:a", "128k"];
  await run(
    "ffmpeg",
    ["-loglevel", "error", "-y", "-i", video, ...inputs, "-filter_complex", [...delayed, mix].join(";"), "-map", "0:v", "-map", "[voice]", "-c:v", "copy", ...codec, temp],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  renameSync(temp, video);
}
