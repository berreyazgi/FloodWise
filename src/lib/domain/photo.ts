/** Image validation + metadata stripping without native deps. Only JPEG and PNG are accepted. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export function sniffImageType(b: Uint8Array): "jpeg" | "png" | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length > 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return "png";
  return null;
}

/** Drops JPEG APPn (EXIF/GPS, XMP, ...) except APP0 (JFIF), and COM segments. */
export function stripJpeg(b: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) throw new Error("Bozuk JPEG");
    const marker = b[i + 1];
    if (marker === 0xda) { parts.push(b.subarray(i)); return concat(parts); } // start of scan: copy rest
    const len = (b[i + 2] << 8) | b[i + 3];
    const keep = !((marker >= 0xe1 && marker <= 0xef) || marker === 0xfe);
    if (keep) parts.push(b.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  throw new Error("Bozuk JPEG");
}

function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

const PNG_KEEP = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "iCCP"]);
/** Keeps only rendering-critical PNG chunks (drops tEXt/iTXt/zTXt/eXIf/tIME...). */
export function stripPng(b: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= b.length) {
    const len = ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
    const type = String.fromCharCode(...b.subarray(i + 4, i + 8));
    const end = i + 12 + len;
    if (end > b.length) throw new Error("Bozuk PNG");
    if (PNG_KEEP.has(type)) parts.push(b.subarray(i, end));
    i = end;
    if (type === "IEND") break;
  }
  return concat(parts);
}

export function sanitizeImage(b: Uint8Array) {
  if (b.length > MAX_PHOTO_BYTES) throw new Error("Fotoğraf 5 MB sınırını aşıyor.");
  const type = sniffImageType(b);
  if (!type) throw new Error("Yalnızca JPEG veya PNG kabul edilir.");
  return { type, bytes: type === "jpeg" ? stripJpeg(b) : stripPng(b) };
}
