import type { ImageRecord, TextureRole } from '../../src/assets/types.ts';
export function textureRole(name: string): TextureRole {
  const n = name.toLowerCase();
  if (/lightmap|ligntmap|sdf/.test(n)) return 'other';
  const roles: [RegExp, TextureRole][] = [[/base.?color/, 'baseColor'], [/diffuse/, 'diffuse'], [/albedo/, 'albedo'], [/normal|(?:^|_)nrm(?:_|$)/, 'normal'], [/rough/, 'roughness'], [/metal/, 'metallic'], [/(?:^|_)ao(?:_|$)|occlusion/, 'AO'], [/emiss|glow/, 'emissive'], [/opacity|alpha|transparen/, 'opacity'], [/mask/, 'mask']];
  return roles.find(([pattern]) => pattern.test(n))?.[1] ?? 'other';
}
type Header = Pick<ImageRecord, 'width' | 'height' | 'alpha' | 'format' | 'inspection' | 'issues'>;
export function inspectImage(data: Buffer, extension: string): Header {
  const result: Header = { width: null, height: null, alpha: null, format: extension.slice(1), inspection: 'header', issues: [] };
  try {
    if (extension === '.png') {
      if (data.length < 33 || data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || data.toString('ascii', 12, 16) !== 'IHDR') throw new Error('Cabecera PNG inválida');
      result.width = data.readUInt32BE(16); result.height = data.readUInt32BE(20); result.alpha = [4, 6].includes(data[25]!);
      let offset = 8, ended = false;
      while (offset + 12 <= data.length) { const length = data.readUInt32BE(offset), type = data.toString('ascii', offset + 4, offset + 8); if (offset + length + 12 > data.length) throw new Error('Chunk PNG truncado'); if (type === 'tRNS') result.alpha = true; if (type === 'IEND') ended = true; offset += length + 12; }
      if (!ended) throw new Error('PNG sin IEND');
    } else if (extension === '.jpg' || extension === '.jpeg') {
      if (data.readUInt16BE(0) !== 0xffd8) throw new Error('JPEG inválido');
      let offset = 2;
      while (offset + 4 < data.length) {
        if (data[offset] !== 0xff) { offset++; continue; }
        const marker = data[offset + 1]!; if (marker === 0xff) { offset++; continue; }
        if ([0xd8, 0xd9, 0x01].includes(marker) || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
        if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) { result.height = data.readUInt16BE(offset + 5); result.width = data.readUInt16BE(offset + 7); result.alpha = false; break; }
        const length = data.readUInt16BE(offset + 2); if (length < 2) throw new Error('Segmento JPEG inválido'); offset += length + 2;
      }
    } else if (extension === '.webp') {
      if (data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WEBP') throw new Error('WebP inválido');
      const kind = data.toString('ascii', 12, 16);
      if (kind === 'VP8X') { result.width = data.readUIntLE(24, 3) + 1; result.height = data.readUIntLE(27, 3) + 1; result.alpha = (data[20]! & 16) !== 0; }
      else if (kind === 'VP8L' && data[20] === 0x2f) { const bits = data.readUInt32LE(21); result.width = (bits & 0x3fff) + 1; result.height = ((bits >>> 14) & 0x3fff) + 1; result.alpha = (bits & 0x10000000) !== 0; }
      else if (kind === 'VP8 ') { result.width = data.readUInt16LE(26) & 0x3fff; result.height = data.readUInt16LE(28) & 0x3fff; result.alpha = false; }
    } else if (extension === '.tga') {
      if (data.length < 18 || ![1, 2, 3, 9, 10, 11].includes(data[2]!)) throw new Error('TGA no reconocido');
      result.width = data.readUInt16LE(12); result.height = data.readUInt16LE(14); result.alpha = (data[17]! & 15) > 0;
    } else { result.inspection = 'unsupported'; result.issues.push({ code: 'unsupported-image', severity: 'warning', message: 'Formato inventariado sin inspección de cabecera' }); return result; }
    if (!result.width || !result.height) throw new Error('No se pudieron leer dimensiones');
  } catch (error) { result.inspection = 'failed'; result.issues.push({ code: 'invalid-image', severity: 'error', message: error instanceof Error ? error.message : String(error) }); }
  return result;
}
