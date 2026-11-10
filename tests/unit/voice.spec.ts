import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { addVoiceOver, commandVoice, hasFfmpeg, kokoroVoice, speak, spokenText, subtitlesOf, type Voice } from "../../src/runtime/voice.js";
import { VoiceOver } from "../../src/demo/voice-over.js";

const exec = promisify(execFile);

/** A voice that "speaks" each line as a tone of `ms` (ffmpeg), counting how often it's asked. */
function toneVoice(ms: number): Voice & { calls: string[] } {
  const calls: string[] = [];
  return {
    id: `tone:${ms}`,
    ext: "wav",
    calls,
    async synthesize(text, out) {
      calls.push(text);
      await exec("ffmpeg", ["-loglevel", "error", "-nostdin", "-y", "-f", "lavfi", "-i", `sine=frequency=440:duration=${ms / 1000}`, out]);
    },
  };
}

describe("voice", () => {
  let ffmpeg = false;
  let dir = "";
  before(async () => {
    ffmpeg = await hasFfmpeg();
    dir = mkdtempSync(join(tmpdir(), "waygraph-voice-"));
  });

  it("speaks arrows and separators as words", () => {
    assert.equal(spokenText("Cart -> info → overview  ·  done"), "Cart to info to overview, done");
  });

  it("writes the lines as WebVTT subtitles", () => {
    const vtt = subtitlesOf([
      { text: "Opens the login page.", atMs: 1500, ms: 2250, file: "a.wav" },
      { text: "Signs in.", atMs: 3_725_004, ms: 1000, file: "b.wav" },
    ]);
    assert.equal(vtt, "WEBVTT\n\n1\n00:00:01.500 --> 00:00:03.750\nOpens the login page.\n\n2\n01:02:05.004 --> 01:02:06.004\nSigns in.\n");
  });

  it("a command voice gets the line on stdin, or as {text}; a failing command says why", async (t) => {
    if (!ffmpeg) return t.skip("no ffmpeg");
    const out = join(dir, "cmd.wav");
    await commandVoice("ffmpeg -loglevel error -y -f lavfi -i sine=duration=0.2 {out}").synthesize("on stdin", out);
    await commandVoice("ffmpeg -loglevel error -nostdin -y -f lavfi -i sine=duration=0.2 -metadata title={text} {out}").synthesize("as an argument", out);
    await assert.rejects(commandVoice("ffmpeg -loglevel error -nostdin -i /nowhere.wav {out}").synthesize("x", join(dir, "never.wav")), /waygraph voice: ffmpeg exited \d+: Error opening input/);
    await assert.rejects(commandVoice("no-such-tts-command {out}").synthesize("x", out), /didn't start/);
  });

  it("speaks a line once per voice and text, then reads it from the cache", async (t) => {
    if (!ffmpeg) return t.skip("no ffmpeg");
    const voice = toneVoice(300);
    const first = await speak(voice, "Hello there", join(dir, "cache"));
    const again = await speak(voice, "Hello   there", join(dir, "cache"));
    assert.equal(first.file, again.file);
    assert.ok(Math.abs(first.ms - 300) < 30, `about 300 ms, got ${first.ms}`);
    assert.deepEqual(voice.calls, ["Hello there"]);
  });

  it("a voice-over speaks lines one after another, skips a repeat, and waits for the last to end", async (t) => {
    if (!ffmpeg) return t.skip("no ffmpeg");
    const startedAt = Date.now();
    const over = new VoiceOver(toneVoice(400), join(dir, "cache"), startedAt, false);
    await over.say("First line");
    await over.say("First line");
    await over.say("Second line");
    await over.settle();
    const [a, b] = over.lines;
    assert.equal(over.lines.length, 2);
    assert.ok(a && b && b.atMs >= a.atMs + a.ms + 350, "the second starts after the first ends, and a breath");
    assert.ok(Date.now() - startedAt >= (b?.atMs ?? 0) + (b?.ms ?? 0), "settle waits for the end of the last line");
  });

  it("puts the lines on a video as its audio track, the picture as it was", async (t) => {
    if (!ffmpeg) return t.skip("no ffmpeg");
    const video = join(dir, "clip.webm");
    await exec("ffmpeg", ["-loglevel", "error", "-nostdin", "-y", "-f", "lavfi", "-i", "testsrc=duration=2:size=320x240:rate=10", "-c:v", "libvpx", video]);
    const line = await speak(toneVoice(500), "A line", join(dir, "cache"));
    await addVoiceOver(video, [{ ...line, text: "A line", atMs: 800 }]);
    const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name", "-of", "csv=p=0", video]);
    assert.deepEqual(stdout.trim().split("\n").sort(), ["opus,audio", "vp8,video"]);
    assert.ok(readFileSync(video).length > 0);
  });

  it("a voice-over makes lines ahead once: saying one being made waits for it", async (t) => {
    if (!ffmpeg) return t.skip("no ffmpeg");
    const voice = toneVoice(200);
    const over = new VoiceOver(voice, join(dir, "ahead"), Date.now(), true);
    over.prepare(["Made ahead", "", "Also ahead"]);
    await over.say("Made ahead");
    await over.settle();
    assert.deepEqual(voice.calls.filter((c) => c === "Made ahead"), ["Made ahead"]);
  });

  it("kokoroVoice() says when this machine hasn't set it up, or has another version", () => {
    const saved = process.env.WAYGRAPH_CACHE_DIR;
    process.env.WAYGRAPH_CACHE_DIR = join(dir, "no-cache");
    try {
      assert.match(kokoroVoice().missing?.() ?? "", /isn't set up on this machine: run waygraph extensions install/);
      const home = join(dir, "no-cache", "voices", "kokoro");
      mkdirSync(home, { recursive: true });
      writeFileSync(join(home, "installed.json"), JSON.stringify({ packages: ["kokoro-onnx==0.1.0"] }));
      assert.match(kokoroVoice().missing?.() ?? "", /another version than this waygraph uses: run waygraph extensions install/);
    } finally {
      if (saved === undefined) delete process.env.WAYGRAPH_CACHE_DIR;
      else process.env.WAYGRAPH_CACHE_DIR = saved;
    }
  });

  it("a Kokoro voice says what's wrong when Python or the package isn't there", async () => {
    const out = join(dir, "k.wav");
    await assert.rejects(kokoroVoice({ python: "/no/such/python", model: "m.onnx", voices: "v.bin" }).synthesize("x", out), /didn't start/);
    await assert.rejects(kokoroVoice({ python: "python3", model: "m.onnx", voices: "v.bin" }).synthesize("x", out), /Kokoro stopped \(exit 1\): .*Error/);
  });

  it("a Kokoro voice speaks with the model loaded once (the one waygraph extensions install set up)", async (t) => {
    const voice = kokoroVoice();
    if (!ffmpeg || voice.missing?.()) return t.skip("no Kokoro set up on this machine");
    try {
      const a = await speak(voice, "First line.", join(dir, "kokoro"));
      const b = await speak(voice, "Second line, from the same model.", join(dir, "kokoro"));
      assert.ok(a.ms > 300 && b.ms > a.ms, `${a.ms} ms, ${b.ms} ms`);
    } finally {
      await voice.close?.();
    }
  });
});
