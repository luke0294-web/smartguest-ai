/**
 * Lightweight magic-byte sniffing for uploaded files — not a full file-type
 * library, just enough to reject a file whose real content doesn't match any
 * expected audio/image format before it's forwarded to OpenAI.
 */

function startsWith(buf: Buffer, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) {
    if (buf[offset + i] !== bytes[i]) return false;
  }
  return true;
}

export function looksLikeImage(buf: Buffer): boolean {
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return true; // JPEG
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return true; // PNG
  if (startsWith(buf, [0x47, 0x49, 0x46, 0x38])) return true; // GIF87a / GIF89a
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) return true; // WEBP
  return false;
}

export function looksLikeAudio(buf: Buffer): boolean {
  if (startsWith(buf, [0x1a, 0x45, 0xdf, 0xa3])) return true; // WebM/Matroska (EBML header)
  if (startsWith(buf, [0x4f, 0x67, 0x67, 0x53])) return true; // Ogg ("OggS")
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x41, 0x56, 0x45], 8)) return true; // WAV
  if (startsWith(buf, [0x49, 0x44, 0x33])) return true; // MP3 with ID3 tag
  if (buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return true; // MP3 frame sync, no ID3
  if (buf.length >= 8 && startsWith(buf, [0x66, 0x74, 0x79, 0x70], 4)) return true; // MP4/M4A (ftyp box)
  return false;
}
