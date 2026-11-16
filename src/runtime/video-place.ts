import { copyFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import type { Flow } from "../engine/flow/flow.js";
import type { Checkpoint } from "../engine/checkpoint/checkpoint.js";

/** What a recording is named from: the flow's `video` meta, and the words its tokens stand for. */
export interface VideoTarget {
  /** The flow's `video` key. */
  video: string;
  /** The flow's name as it was asked for (`checkoutFlow`). */
  flow: string;
  title?: string | undefined;
  label?: string | undefined;
}

/** The first flow of a run that says where its video goes (`map({ video })`), with its name, title and first label. */
export function videoTargetOf(flows: readonly Flow<Checkpoint<string>>[], names: readonly string[]): VideoTarget | undefined {
  const at = flows.findIndex((f) => f.meta?.video !== undefined);
  const flow = flows[at];
  if (!flow?.meta?.video) return undefined;
  return { video: flow.meta.video, flow: names[at] ?? "flow", title: flow.meta.title, label: flow.meta.labels?.[0] };
}

const slug = (text: string): string => text.normalize("NFKD").replace(/[^\w\s.-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();

/** `{flow}`, `{title}`, `{label}`, `{date}` (2026-11-16), `{time}` (14-05-09) and `{pane}` made into a path piece. */
export function expandVideoName(template: string, target: VideoTarget, pane?: string, now = new Date()): string {
  const iso = now.toISOString();
  const words: Record<string, string> = {
    flow: slug(target.flow),
    title: slug(target.title ?? target.flow),
    label: slug(target.label ?? ""),
    date: iso.slice(0, 10),
    time: iso.slice(11, 19).replace(/:/g, "-"),
    pane: slug(pane ?? ""),
  };
  return template
    .split("/")
    .map((part) => part.replace(/\{(\w+)\}/g, (_, key: string) => words[key] ?? "").replace(/^[-_.]+|[-_.]+$/g, ""))
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
}

/** Moves a saved recording to the key its flow gave (`<dir>/<key>.webm`), its subtitles with it; the new path, or the old one when there's no key. */
export function placeVideo(file: string, dir: string, target: VideoTarget | undefined, pane?: string): string {
  if (!target) return file;
  const key = expandVideoName(target.video, target, pane) || slug(target.flow);
  const base = join(dir, pane && !target.video.includes("{pane}") ? `${key}-${slug(pane)}` : key);
  let dest = `${base}${extname(file)}`;
  for (let n = 2; existsSync(dest); n++) dest = `${base}-${n}${extname(file)}`;
  mkdirSync(dirname(dest), { recursive: true });
  move(file, dest);
  const subtitles = file.replace(/\.\w+$/, ".vtt");
  if (existsSync(subtitles)) move(subtitles, dest.replace(/\.\w+$/, ".vtt"));
  return dest;
}

function move(from: string, to: string): void {
  try {
    renameSync(from, to);
  } catch {
    copyFileSync(from, to);
    unlinkSync(from);
  }
}
