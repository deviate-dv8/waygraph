import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import { loadWaygraphConfig } from "./config.js";

/** The user's Downloads folder, or undefined when there is none (a server, a container). */
export function downloadsDir(): string | undefined {
  const home = homedir();
  let dir = process.env.XDG_DOWNLOAD_DIR;
  if (!dir && process.platform === "linux") {
    try {
      const line = readFileSync(join(process.env.XDG_CONFIG_HOME ?? join(home, ".config"), "user-dirs.dirs"), "utf-8")
        .split("\n")
        .find((l) => l.startsWith("XDG_DOWNLOAD_DIR="));
      dir = line?.slice("XDG_DOWNLOAD_DIR=".length).replace(/^"|"$/g, "").replace("$HOME", home);
    } catch {
      /* no user-dirs file: use the conventional name */
    }
  }
  dir ??= join(home, "Downloads");
  return existsSync(dir) ? dir : undefined;
}

const expandHome = (p: string): string => (p === "~" || p.startsWith("~/") ? join(homedir(), p.slice(1)) : p);

/** True if a file can be created in `dir` (macOS asks permission for Downloads the first time; a denial surfaces here). */
function writable(dir: string): boolean {
  try {
    mkdirSync(dir, { recursive: true });
    const probe = join(dir, `.waygraph-probe-${process.pid}`);
    writeFileSync(probe, "");
    rmSync(probe);
    return true;
  } catch {
    return false;
  }
}

/**
 * Where `--video` recordings go: `WAYGRAPH_VIDEO_DIR`, else `video.dir` from the config (absolute, `~/…`, or relative to
 * the project), else `<Downloads>/waygraph-videos/<project>`. With no usable Downloads folder, or on CI, it is
 * `<project>/.waygraph-videos`. An explicit `--video <dir>` never reaches this.
 */
export async function resolveVideoDir(projectDir: string): Promise<string> {
  const fallback = join(projectDir, ".waygraph-videos");
  const configured = process.env.WAYGRAPH_VIDEO_DIR || (await loadWaygraphConfig(projectDir))?.video?.dir;
  if (configured) {
    const dir = isAbsolute(expandHome(configured)) ? expandHome(configured) : resolve(projectDir, configured);
    if (writable(dir)) return dir;
    console.error(`waygraph: cannot write videos to ${dir} - using ${fallback}`);
    return fallback;
  }
  const downloads = process.env.CI ? undefined : downloadsDir();
  if (!downloads) return fallback;
  const dir = join(downloads, "waygraph-videos", basename(resolve(projectDir)));
  if (writable(dir)) return dir;
  console.error(`waygraph: cannot write to ${downloads} (denied?) - saving videos in ${fallback}`);
  return fallback;
}
