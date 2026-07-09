// Verbatim extraction.
//
// The tweet's ask: "I'd much rather have someone verbatim cite their code."
// So beyond a score, zerobits can strip the padding and hand back the sentences
// that actually carry payload — plus how many tokens you spent vs. needed.

import { estimateTokens } from './tokens.js';
import { compressionStats } from './compression.js';
import { FILLER_PHRASES, HEDGES } from './filler.js';

const FILLER_SET = new Set([...FILLER_PHRASES, ...HEDGES].map((s) => s.toLowerCase()));

/**
 * Split into sentences. Unwraps soft line-wraps inside a paragraph (so hard-wrapped
 * prose isn't chopped mid-sentence), but keeps blank-line paragraph breaks and list
 * bullets as boundaries.
 */
export function splitSentences(text) {
  const normalized = text.replace(/\r\n/g, '\n');
  const paragraphs = normalized.split(/\n\s*\n+/);
  const out = [];
  for (const para of paragraphs) {
    // Bullets become their own chunks; everything else is soft-wrap-joined.
    const chunks = para
      .split(/\n(?=\s*[-*•]\s)/)
      .map((chunk) => chunk.replace(/\n+/g, ' ').trim())
      .filter(Boolean);
    for (const chunk of chunks) {
      const cleaned = chunk.replace(/^\s*[-*•]\s*/, '');
      const parts = cleaned.split(/(?<=[.!?])\s+(?=["'(\[]?[A-Z0-9])/);
      for (const part of parts) {
        const s = part.trim();
        if (s) out.push(s);
      }
    }
  }
  return out;
}

/**
 * Score a single sentence for information contribution. Combines its own
 * compressed-information density with a penalty for filler-phrase load.
 */
function sentenceSignal(sentence) {
  const tokens = estimateTokens(sentence);
  if (tokens === 0) return 0;
  const { infoBits } = compressionStats(sentence);
  const bitsPerToken = infoBits / tokens;

  const lower = sentence.toLowerCase();
  let fillerHits = 0;
  for (const phrase of FILLER_SET) {
    if (lower.includes(phrase)) fillerHits += 1;
  }
  const fillerPenalty = (fillerHits / tokens) * 100;

  return bitsPerToken - fillerPenalty * 0.5;
}

/**
 * @param {string} text
 * @param {object} [opts]
 * @param {number} [opts.keepRatio=0.5] - fraction of sentences to keep (by signal)
 * @returns {{
 *   keptSentences: string[],
 *   droppedCount: number,
 *   condensed: string,
 *   tokensBefore: number,
 *   tokensAfter: number,
 *   savedPct: number
 * }}
 */
export function extractSignal(text, opts = {}) {
  const keepRatio = opts.keepRatio ?? 0.5;
  const sentences = splitSentences(text);

  if (sentences.length <= 1) {
    const tokensBefore = estimateTokens(text);
    return {
      keptSentences: sentences,
      droppedCount: 0,
      condensed: sentences.join(' '),
      tokensBefore,
      tokensAfter: tokensBefore,
      savedPct: 0,
    };
  }

  const scored = sentences.map((s, i) => ({ i, s, signal: sentenceSignal(s) }));
  const ranked = [...scored].sort((a, b) => b.signal - a.signal);
  const keepCount = Math.max(1, Math.round(sentences.length * keepRatio));
  const keepIndices = new Set(ranked.slice(0, keepCount).map((x) => x.i));

  // Preserve original order for readability.
  const kept = scored.filter((x) => keepIndices.has(x.i)).map((x) => x.s);
  const condensed = kept.join(' ');

  const tokensBefore = estimateTokens(text);
  const tokensAfter = estimateTokens(condensed);

  return {
    keptSentences: kept,
    droppedCount: sentences.length - kept.length,
    condensed,
    tokensBefore,
    tokensAfter,
    savedPct: tokensBefore > 0 ? Math.round((1 - tokensAfter / tokensBefore) * 100) : 0,
  };
}
