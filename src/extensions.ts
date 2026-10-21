// Browser extensions for waygraph runs: resolve a config entry to an unpacked directory Chromium can load.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { inflateRawSync } from "node:zlib";

/** A known name (`"hoppscotch"`), a Chrome Web Store id, a path to an unpacked extension, or `{ id, sha256 }`. */
export type ExtensionSpec = string | { id?: string; path?: string; sha256?: string };

export const KNOWN_EXTENSIONS: Readonly<Record<string, string>> = {
  hoppscotch: "amknoiejhlmhancpahfcfcfhllgkpbld",
};

const STORE_ID = /^[a-p]{32}$/;

function cacheDir(): string {
  const base = process.env.WAYGRAPH_CACHE_DIR ?? join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "waygraph");
  return join(base, "extensions");
}

/** Reads the end-of-central-directory record and extracts every entry; rejects paths that escape `dest`. */
function unzipTo(zip: Buffer, dest: string): void {
  let eocd = zip.length - 22;
  while (eocd >= 0 && zip.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("not a zip archive");
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const root = resolve(dest);
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error("corrupt zip directory");
    const method = zip.readUInt16LE(p + 10);
    const size = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const name = zip.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    const target = resolve(root, name);
    if (target !== root && !target.startsWith(root + sep)) throw new Error(`unsafe path in archive: ${name}`);
    if (name.endsWith("/")) {
      mkdirSync(target, { recursive: true });
      continue;
    }
    const dataStart = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const raw = zip.subarray(dataStart, dataStart + size);
    if (method !== 0 && method !== 8) throw new Error(`unsupported zip compression (${method}) for ${name}`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, method === 0 ? raw : inflateRawSync(raw));
  }
}

/** A .crx is a signed header followed by a normal zip. The signature is not checked here - pin `sha256` to do that. */
function crxToZip(crx: Buffer): Buffer {
  if (crx.toString("latin1", 0, 4) !== "Cr24") throw new Error("not a Chrome extension (.crx) file");
  const version = crx.readUInt32LE(4);
  if (version === 3) return crx.subarray(12 + crx.readUInt32LE(8));
  if (version === 2) return crx.subarray(16 + crx.readUInt32LE(8) + crx.readUInt32LE(12));
  throw new Error(`unsupported .crx version ${version}`);
}

/** Reads the length-delimited fields of one protobuf message as [fieldNumber, bytes] pairs; other wire types are skipped. */
function protoFields(buf: Buffer): [number, Buffer][] {
  const out: [number, Buffer][] = [];
  let p = 0;
  const varint = (): number => {
    let n = 0;
    for (let shift = 0; ; shift += 7) {
      const b = buf[p++]!;
      n += (b & 0x7f) * 2 ** shift;
      if (!(b & 0x80)) return n;
    }
  };
  while (p < buf.length) {
    const tag = varint();
    const wire = tag & 7;
    if (wire === 2) {
      const len = varint();
      out.push([tag >>> 3, buf.subarray(p, p + len)]);
      p += len;
    } else if (wire === 0) varint();
    else if (wire === 1) p += 8;
    else if (wire === 5) p += 4;
    else break;
  }
  return out;
}

/** The extension's public key (DER), from which Chrome derives its id: with it in the manifest the id equals the store's. */
function crxPublicKey(crx: Buffer): Buffer | undefined {
  const version = crx.readUInt32LE(4);
  if (version === 2) return crx.subarray(16, 16 + crx.readUInt32LE(8));
  const header = protoFields(crx.subarray(12, 12 + crx.readUInt32LE(8)));
  const signed = header.find(([n]) => n === 10000)?.[1];
  const crxId = signed ? protoFields(signed).find(([n]) => n === 1)?.[1] : undefined;
  for (const [n, proof] of header) {
    if (n !== 2 && n !== 3) continue;
    const key = protoFields(proof).find(([f]) => f === 1)?.[1];
    if (key && crxId && createHash("sha256").update(key).digest().subarray(0, 16).equals(crxId)) return key;
  }
  return undefined;
}

/** Unpacks a .crx and pins the manifest `key`, so the extension keeps its store id (its origin is then stable, e.g. for an API allowlist). */
export function unpackCrx(crx: Buffer, dest: string): void {
  unzipTo(crxToZip(crx), dest);
  const key = crxPublicKey(crx);
  if (!key) return;
  const file = join(dest, "manifest.json");
  const manifest = JSON.parse(readFileSync(file, "utf-8")) as Record<string, unknown>;
  manifest.key = key.toString("base64");
  writeFileSync(file, JSON.stringify(manifest, null, 2));
}

function readManifest(dir: string): { name?: string; version?: string } {
  const file = join(dir, "manifest.json");
  if (!existsSync(file)) throw new Error(`no manifest.json in ${dir}`);
  return JSON.parse(readFileSync(file, "utf-8")) as { name?: string; version?: string };
}

async function download(id: string, sha256: string | undefined): Promise<Buffer> {
  const url =
    "https://clients2.google.com/service/update2/crx?response=redirect&prodversion=130.0.0.0" +
    `&acceptformat=crx2,crx3&x=id%3D${id}%26uc`;
  const res = await fetch(url);
  const body = Buffer.from(await res.arrayBuffer());
  if (!res.ok || body.length < 16 || body.toString("latin1", 0, 4) !== "Cr24") {
    throw new Error(`extension ${id} was not found in the Chrome Web Store (HTTP ${res.status})`);
  }
  if (sha256 && createHash("sha256").update(body).digest("hex") !== sha256.toLowerCase()) {
    throw new Error(`extension ${id}: downloaded file does not match the pinned sha256`);
  }
  return body;
}

/**
 * Returns an unpacked directory for one config entry, downloading it on first use. An installed
 * extension is never silently replaced - pass `update: true` (`waygraph extensions install --update`) to refetch.
 */
export async function resolveExtension(spec: ExtensionSpec, projectDir: string, opts: { update?: boolean } = {}): Promise<string> {
  const entry = typeof spec === "string" ? (spec.startsWith(".") || spec.includes("/") ? { path: spec } : { id: spec }) : spec;
  if (entry.path) {
    const dir = resolve(projectDir, entry.path);
    readManifest(dir);
    return dir;
  }
  const id = KNOWN_EXTENSIONS[entry.id ?? ""] ?? entry.id ?? "";
  if (!STORE_ID.test(id)) {
    throw new Error(
      `unknown extension "${entry.id}" - use a known name (${Object.keys(KNOWN_EXTENSIONS).join(", ")}), a Chrome Web Store id, or { path }`,
    );
  }
  const dir = join(cacheDir(), id);
  if (!opts.update && existsSync(join(dir, "manifest.json"))) return dir;
  const tmp = `${dir}.tmp-${process.pid}`;
  rmSync(tmp, { recursive: true, force: true });
  try {
    unpackCrx(await download(id, entry.sha256), tmp);
    readManifest(tmp);
    rmSync(dir, { recursive: true, force: true });
    renameSync(tmp, dir);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return dir;
}

export async function resolveExtensions(specs: readonly ExtensionSpec[] | undefined, projectDir: string): Promise<string[]> {
  return Promise.all((specs ?? []).map((s) => resolveExtension(s, projectDir)));
}

export function extensionInfo(dir: string): { name: string; version: string } {
  const m = readManifest(dir);
  return { name: m.name ?? dir, version: m.version ?? "?" };
}
