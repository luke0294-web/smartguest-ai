import { describe, it, expect } from "vitest";
import { deflateRawSync, crc32 } from "node:zlib";
import {
  DocumentExtractionError,
  MAX_DOCX_UNCOMPRESSED_BYTES,
  extractDocxText,
  zipDeclaredUncompressedSize,
} from "./documentExtract";

/** Minimal single-entry ZIP (deflate) — enough to exercise the central-directory reader. */
function buildZip(name: string, content: Buffer): Buffer {
  const nameBuf = Buffer.from(name, "utf8");
  const data = deflateRawSync(content);
  const crc = crc32(content);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(0, 42); // local header offset

  const localPart = Buffer.concat([local, nameBuf, data]);
  const centralPart = Buffer.concat([central, nameBuf]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralPart.length, 12);
  eocd.writeUInt32LE(localPart.length, 16);

  return Buffer.concat([localPart, centralPart, eocd]);
}

describe("zipDeclaredUncompressedSize", () => {
  it("reads the declared size of a normal archive", () => {
    const zip = buildZip("word/document.xml", Buffer.from("<w:document>ciao</w:document>"));
    expect(zipDeclaredUncompressedSize(zip)).toBe(29);
  });

  it("returns null for something that is not a zip", () => {
    expect(zipDeclaredUncompressedSize(Buffer.from("PK\x03\x04 not really a zip"))).toBeNull();
  });
});

describe("extractDocxText zip-bomb guard", () => {
  it("rejects an archive that would expand past the limit, before parsing it", async () => {
    const bomb = buildZip("word/document.xml", Buffer.alloc(MAX_DOCX_UNCOMPRESSED_BYTES + 1024));
    expect(bomb.length).toBeLessThan(200 * 1024); // tiny on disk…
    await expect(extractDocxText(bomb)).rejects.toBeInstanceOf(DocumentExtractionError);
  });
});

describe("zipInflatesWithin (real decompression cap)", () => {
  it("accepts a normal archive", async () => {
    const { zipInflatesWithin } = await import("./documentExtract");
    const zip = buildZip("word/document.xml", Buffer.from("<w:document>ciao</w:document>"));
    expect(zipInflatesWithin(zip, 1024)).toBe(true);
  });

  it("rejects a bomb that LIES about its size in the central directory", async () => {
    const { zipInflatesWithin } = await import("./documentExtract");
    // Really inflates past the 50 MB cap…
    const bomb = buildZip("word/document.xml", Buffer.alloc(MAX_DOCX_UNCOMPRESSED_BYTES + 10 * 1024 * 1024));
    // …but its central directory claims 10 bytes (offset 24 = uncompressed size).
    const cd = bomb.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    bomb.writeUInt32LE(10, cd + 24);
    expect(zipDeclaredUncompressedSize(bomb)).toBe(10); // the declared check alone is fooled…
    expect(zipInflatesWithin(bomb, MAX_DOCX_UNCOMPRESSED_BYTES)).toBe(false); // …the real one is not
    // …and the rejection comes from the guard, before mammoth/JSZip ever runs.
    await expect(extractDocxText(bomb)).rejects.toThrow(/troppo grande o danneggiato/);
  });
});
