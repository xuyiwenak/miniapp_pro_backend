type ImageMeta = {
  width?: number;
  height?: number;
};

function parsePngMeta(buffer: Buffer): ImageMeta | null {
  if (buffer.length < 24) return null;
  const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buffer.subarray(0, 8).equals(pngSig)) return null;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

function parseGifMeta(buffer: Buffer): ImageMeta | null {
  if (buffer.length < 10) return null;
  const sig = buffer.subarray(0, 6).toString('ascii');
  if (sig !== 'GIF87a' && sig !== 'GIF89a') return null;
  const width = buffer.readUInt16LE(6);
  const height = buffer.readUInt16LE(8);
  return { width, height };
}

function parseJpegMeta(buffer: Buffer): ImageMeta | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    const isSofMarker = (
      marker === 0xc0 || marker === 0xc1 || marker === 0xc2 || marker === 0xc3 ||
      marker === 0xc5 || marker === 0xc6 || marker === 0xc7 || marker === 0xc9 ||
      marker === 0xca || marker === 0xcb || marker === 0xcd || marker === 0xce ||
      marker === 0xcf
    );
    if (isSofMarker) {
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      return { width, height };
    }
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    if (offset + 3 >= buffer.length) break;
    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2) break;
    offset += 2 + segmentLength;
  }
  return null;
}

export function getImageMeta(buffer: Buffer, contentType: string): ImageMeta {
  const lowerType = contentType.toLowerCase();
  if (lowerType.includes('png')) return parsePngMeta(buffer) ?? {};
  if (lowerType.includes('gif')) return parseGifMeta(buffer) ?? {};
  if (lowerType.includes('jpeg') || lowerType.includes('jpg')) return parseJpegMeta(buffer) ?? {};
  const png = parsePngMeta(buffer);
  if (png) return png;
  const gif = parseGifMeta(buffer);
  if (gif) return gif;
  const jpeg = parseJpegMeta(buffer);
  if (jpeg) return jpeg;
  return {};
}

