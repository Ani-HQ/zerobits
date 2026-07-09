// Compression-based information content.
//
// The core idea behind zerobits: the *actual information* in a piece of text is
// well approximated by how many bytes a good compressor needs to represent it.
// Filler, boilerplate, and repetition compress away to almost nothing; genuinely
// novel content does not. We use raw DEFLATE (no gzip/zlib header) at max level so
// short inputs aren't dominated by container overhead.
//
// "bits of information" = compressed bytes x 8. Divide by tokens to operationalise
// the tweet directly: how many bits are you spending per token you make me read?

import zlib from 'node:zlib';

/**
 * @param {string} text
 * @returns {{ rawBytes: number, compressedBytes: number, ratio: number, infoBits: number }}
 */
export function compressionStats(text) {
  const bytes = Buffer.from(text, 'utf8');
  const rawBytes = bytes.length;
  if (rawBytes === 0) {
    return { rawBytes: 0, compressedBytes: 0, ratio: 0, infoBits: 0 };
  }
  const compressedBytes = zlib.deflateRawSync(bytes, { level: 9 }).length;
  return {
    rawBytes,
    compressedBytes,
    // Lower ratio = more compressible = less information per byte.
    ratio: compressedBytes / rawBytes,
    infoBits: compressedBytes * 8,
  };
}
