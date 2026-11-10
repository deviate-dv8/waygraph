// Text to speech for recorded demos: a Voice turns a line into an audio file (a local command, or an OpenAI-compatible
// speech API), lines are cached by voice and text, and a recording gets them as its audio track (ffmpeg) and as
// subtitles (.vtt) beside it.
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { waygraphCacheDir } from "./extensions.js";
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
  /** Stops what the voice keeps running between lines (a model loaded once), when the recording is done. */
  close?(): Promise<void>;
  /** Downloads what the voice needs (a model), once per machine: `waygraph extensions install` calls it. */
  install?(opts: { update?: boolean; log: (line: string) => void }): Promise<void>;
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

/** Settings for {@link kokoroVoice}. Without `python`, `model` and `voices`, the copy `waygraph extensions install` made. */
export interface KokoroVoiceOptions {
  /** A Python with `kokoro-onnx` and `soundfile` installed. */
  python?: string;
  /** `kokoro-v1.0.onnx` (from the kokoro-onnx releases). */
  model?: string;
  /** `voices-v1.0.bin`, beside it. */
  voices?: string;
  /** Default `"af_heart"`; `"af_bella"`, `"am_michael"`, `"bf_emma"`... */
  voice?: string;
  /** `1` is normal; `0.9` a little slower. */
  speed?: number;
  /** Default `"en-us"`. */
  lang?: string;
}

/** The Kokoro worker: loads the model once, then writes one wav per JSON line on stdin, answering each with a line. */
const KOKORO_WORKER = `
import json, sys
from kokoro_onnx import Kokoro
import soundfile as sf
k = Kokoro(sys.argv[1], sys.argv[2])
print(json.dumps({"ready": True}), flush=True)
for line in sys.stdin:
    job = json.loads(line)
    try:
        samples, rate = k.create(job["text"], voice=job["voice"], speed=job["speed"], lang=job["lang"])
        sf.write(job["out"], samples, rate)
        print(json.dumps({"ok": True}), flush=True)
    except Exception as err:
        print(json.dumps({"error": str(err)}), flush=True)
`;

const KOKORO_RELEASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0";

/** Where `waygraph extensions install` puts Kokoro: a Python environment with it, and its model. */
function kokoroHome(): { dir: string; python: string; model: string; voices: string } {
  const dir = join(waygraphCacheDir(), "voices", "kokoro");
  const python = process.platform === "win32" ? join(dir, "venv", "Scripts", "python.exe") : join(dir, "venv", "bin", "python");
  return { dir, python, model: join(dir, "kokoro-v1.0.onnx"), voices: join(dir, "voices-v1.0.bin") };
}

/** Downloads `url` to `file` (whole, then moved into place), logging every tenth of the way. */
async function download(url: string, file: string, log: (line: string) => void): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`waygraph voice: ${url} answered ${response.status}`);
  const total = Number(response.headers.get("content-length") ?? 0);
  const temp = `${file}.part`;
  const out = createWriteStream(temp);
  let got = 0;
  let shown = 0;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    got += chunk.length;
    if (!out.write(chunk)) await new Promise((r) => out.once("drain", r));
    const tenth = total ? Math.floor((got / total) * 10) : 0;
    if (tenth > shown) {
      shown = tenth;
      log(`  ${basename(file)} ${tenth * 10}%`);
    }
  }
  await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
  renameSync(temp, file);
}

/** Sets Kokoro up in waygraph's cache: a Python environment with kokoro-onnx (through uv when there is one), its model. */
async function installKokoro(opts: { update?: boolean; log: (line: string) => void }): Promise<void> {
  const home = kokoroHome();
  mkdirSync(home.dir, { recursive: true });
  if (opts.update || !existsSync(home.python)) {
    opts.log(`waygraph voice: a Python environment for Kokoro in ${home.dir}`);
    rmSync(join(home.dir, "venv"), { recursive: true, force: true });
    const uv = await run("uv", ["--version"]).then(() => true, () => false);
    // kokoro-onnx needs a Python onnxruntime supports; uv fetches one when the machine's is too new.
    if (uv) {
      await run("uv", ["venv", "--quiet", "--python", "3.12", join(home.dir, "venv")]);
      await run("uv", ["pip", "install", "--quiet", "--python", home.python, "kokoro-onnx", "soundfile"], { maxBuffer: 16 * 1024 * 1024 });
    } else {
      await run("python3", ["-m", "venv", join(home.dir, "venv")]).catch((err: unknown) => {
        throw new Error(`waygraph voice: python3 -m venv failed (${err instanceof Error ? err.message.split("\n")[0] : String(err)}); install uv (https://docs.astral.sh/uv/) and run this again`);
      });
      await run(home.python, ["-m", "pip", "install", "--quiet", "kokoro-onnx", "soundfile"], { maxBuffer: 16 * 1024 * 1024 });
    }
  }
  for (const [file, name] of [[home.model, "kokoro-v1.0.onnx"], [home.voices, "voices-v1.0.bin"]] as const) {
    if (!opts.update && existsSync(file)) continue;
    opts.log(`waygraph voice: downloading ${name}`);
    await download(`${KOKORO_RELEASE}/${name}`, file, opts.log);
  }
  opts.log(`waygraph voice: Kokoro is ready in ${home.dir}`);
}

/**
 * A voice from Kokoro, a natural-sounding local model (82M parameters, CPU is enough): the model is loaded once, in one
 * Python process kept for the recording, and each line is a request to it. `waygraph extensions install` sets it up
 * once per machine (about 350 MB); or point it at your own Python and model.
 * @example kokoroVoice()                         // the copy `waygraph extensions install` made
 * @example kokoroVoice({ voice: "am_michael", speed: 0.95 })
 */
export function kokoroVoice(given: KokoroVoiceOptions = {}): Voice {
  const home = kokoroHome();
  const opts = { python: given.python ?? home.python, model: given.model ?? home.model, voices: given.voices ?? home.voices };
  const own = given.python === undefined && given.model === undefined && given.voices === undefined;
  const voice = given.voice ?? "af_heart";
  const speed = given.speed ?? 1;
  const lang = given.lang ?? "en-us";
  let worker: { child: ReturnType<typeof spawn>; answers: string[]; waiting: ((line: string) => void)[]; ended: Promise<string> } | undefined;
  let busy: Promise<unknown> = Promise.resolve();
  const answer = (w: NonNullable<typeof worker>): Promise<string> =>
    new Promise((resolve) => {
      const ready = w.answers.shift();
      if (ready !== undefined) resolve(ready);
      else w.waiting.push(resolve);
    });
  const start = async (): Promise<NonNullable<typeof worker>> => {
    if (worker && worker.child.exitCode === null) return worker;
    if (own && !existsSync(opts.python)) throw new Error("waygraph voice: Kokoro isn't set up on this machine: run waygraph extensions install");
    const child = spawn(opts.python, ["-u", "-c", KOKORO_WORKER, opts.model, opts.voices], { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    let buffered = "";
    // What a request gets when the worker is gone: its last error line.
    const ended = new Promise<string>((resolve) => {
      child.on("error", (err) => resolve(JSON.stringify({ error: `${opts.python} didn't start: ${err.message}` })));
      child.on("close", (code) => resolve(JSON.stringify({ error: `Kokoro stopped (exit ${code})${stderr.trim() ? `: ${stderr.trim().split("\n").pop()}` : ""}` })));
    });
    const w = { child, answers: [] as string[], waiting: [] as ((line: string) => void)[], ended };
    child.stderr?.on("data", (d: Buffer) => (stderr = (stderr + d.toString()).slice(-2000)));
    child.stdout?.on("data", (d: Buffer) => {
      buffered += d.toString();
      for (let at = buffered.indexOf("\n"); at >= 0; at = buffered.indexOf("\n")) {
        const line = buffered.slice(0, at);
        buffered = buffered.slice(at + 1);
        const waiter = w.waiting.shift();
        if (waiter) waiter(line);
        else w.answers.push(line);
      }
    });
    // close() ends it when the recording is done; a run that stops another way takes it down too.
    process.once("exit", () => child.kill());
    const first = JSON.parse(await Promise.race([answer(w), w.ended])) as { ready?: boolean; error?: string };
    if (!first.ready) throw new Error(`waygraph voice: ${first.error ?? "Kokoro didn't start"}`);
    worker = w;
    return w;
  };
  return {
    id: `kokoro:${basename(opts.model)}:${voice}:${speed}:${lang}`,
    ext: "wav",
    synthesize(text, out) {
      // One line at a time: the worker answers in order.
      const job = busy.then(async () => {
        const w = await start();
        w.child.stdin?.write(JSON.stringify({ text, out, voice, speed, lang }) + "\n");
        const reply = JSON.parse(await Promise.race([answer(w), w.ended])) as { ok?: boolean; error?: string };
        if (!reply.ok) throw new Error(`waygraph voice: Kokoro: ${reply.error ?? "no answer"}`);
      });
      // The next line waits for this one, failed or not: its caller gets the failure.
      busy = job.then(
        () => undefined,
        () => undefined,
      );
      return job;
    },
    async close() {
      worker?.child.stdin?.end();
      worker = undefined;
    },
    // Only the copy in waygraph's cache is waygraph's to install; a Python and model you named are yours.
    ...(own ? { install: installKokoro } : {}),
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
