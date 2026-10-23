import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import { extensionInfo, resolveExtension, unpackCrx } from "../../src/runtime/extensions.js";

function zip(files: Record<string, string>, deflate = false): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBuf = Buffer.from(name);
    const raw = Buffer.from(text);
    const data = deflate ? deflateRawSync(raw) : raw;
    const method = deflate ? 8 : 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0);
    head.writeUInt16LE(method, 10);
    head.writeUInt32LE(data.length, 20);
    head.writeUInt32LE(raw.length, 24);
    head.writeUInt16LE(nameBuf.length, 28);
    head.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    central.push(head, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

function crx3(zipBuf: Buffer): Buffer {
  const head = Buffer.alloc(12);
  head.write("Cr24", 0, "latin1");
  head.writeUInt32LE(3, 4);
  head.writeUInt32LE(4, 8);
  return Buffer.concat([head, Buffer.alloc(4), zipBuf]);
}

const field = (n: number, bytes: Buffer): Buffer => {
  const tag = Buffer.from([(n << 3) | 2]);
  const len: number[] = [];
  for (let v = bytes.length; ; v >>>= 7) {
    len.push((v & 0x7f) | (v > 0x7f ? 0x80 : 0));
    if (v <= 0x7f) break;
  }
  return Buffer.concat([tag, Buffer.from(len), bytes]);
};
// field numbers above 15 need a two-byte tag; 10000 is crx's signed_header_data
const bigField = (n: number, bytes: Buffer): Buffer => {
  const tag: number[] = [];
  for (let v = (n << 3) | 2; ; v >>>= 7) {
    tag.push((v & 0x7f) | (v > 0x7f ? 0x80 : 0));
    if (v <= 0x7f) break;
  }
  return Buffer.concat([Buffer.from(tag), Buffer.from([bytes.length]), bytes]);
};

function crx3WithKey(zipBuf: Buffer, publicKey: Buffer): Buffer {
  const crxId = createHash("sha256").update(publicKey).digest().subarray(0, 16);
  const header = Buffer.concat([field(2, field(1, publicKey)), bigField(10000, field(1, crxId))]);
  const head = Buffer.alloc(12);
  head.write("Cr24", 0, "latin1");
  head.writeUInt32LE(3, 4);
  head.writeUInt32LE(header.length, 8);
  return Buffer.concat([head, header, zipBuf]);
}

const tmp = () => mkdtempSync(join(tmpdir(), "wg-ext-test-"));
const manifest = JSON.stringify({ name: "Fake", version: "1.2" });

describe("extensions", () => {
  it("unpacks a stored and a deflated crx3", () => {
    for (const deflate of [false, true]) {
      const dest = tmp();
      unpackCrx(crx3(zip({ "manifest.json": manifest, "js/a.js": "x".repeat(500) }, deflate)), dest);
      assert.deepEqual(extensionInfo(dest), { name: "Fake", version: "1.2" });
      assert.equal(readFileSync(join(dest, "js/a.js"), "utf-8"), "x".repeat(500));
    }
  });

  it("pins the manifest key to the crx's public key, so the extension keeps its store id", () => {
    const publicKey = Buffer.from("not-a-real-key-but-bytes-are-bytes");
    const dest = tmp();
    unpackCrx(crx3WithKey(zip({ "manifest.json": manifest }), publicKey), dest);
    assert.equal(JSON.parse(readFileSync(join(dest, "manifest.json"), "utf-8")).key, publicKey.toString("base64"));
  });

  it("refuses an archive that escapes the destination", () => {
    assert.throws(() => unpackCrx(crx3(zip({ "../evil.txt": "x" })), tmp()), /unsafe path/);
  });

  it("refuses a file that is not a crx", () => {
    assert.throws(() => unpackCrx(Buffer.from("PK nope, not a crx file"), tmp()), /not a Chrome extension/);
  });

  it("resolves a path entry and rejects one without a manifest", async () => {
    const project = tmp();
    mkdirSync(join(project, "ext"));
    await assert.rejects(resolveExtension("./ext", project), /no manifest/);
    writeFileSync(join(project, "ext/manifest.json"), manifest);
    assert.equal(await resolveExtension("./ext", project), join(project, "ext"));
  });

  it("rejects an unknown name", async () => {
    await assert.rejects(resolveExtension("nope", tmp()), /unknown extension/);
  });
});
