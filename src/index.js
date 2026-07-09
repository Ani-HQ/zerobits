// zerobits — public API.
//
//   import { analyze } from 'zerobits';
//   const result = await analyze(text, { threshold: 500 });
//
// analyze() is fully local and needs no network or API key. For the optional
// semantic pass, import { judge } separately (it hits a hosted model).

import { countTokens } from './tokens.js';
import { compressionStats } from './compression.js';
import { lexicalStats } from './lexical.js';
import { repetitionStats } from './repetition.js';
import { fillerStats } from './filler.js';
import { score, DEFAULTS } from './score.js';
import { extractSignal, splitSentences } from './verbatim.js';

export { judge, buildPrompt, detectProvider, RUBRIC } from './judge.js';
export { DEFAULTS } from './score.js';
export { estimateTokens, countTokens } from './tokens.js';

/**
 * Analyse a piece of text. Local only.
 *
 * @param {string} text
 * @param {object} [opts]
 * @param {number} [opts.threshold=500]   token count above which text is "long"
 * @param {number} [opts.minDensity=35]   density below which long text is "low signal"
 * @param {boolean} [opts.verbatim=false] also extract the signal-bearing sentences
 * @returns {Promise<object>} full result (see README for the schema)
 */
export async function analyze(text, opts = {}) {
  const input = String(text ?? '');
  const { count: tokens, method: tokenMethod } = await countTokens(input);

  const comp = compressionStats(input);
  const lex = lexicalStats(input);
  const rep = repetitionStats(input);
  const fill = fillerStats(input, tokens);
  const sentences = splitSentences(input).length;
  const bitsPerToken = tokens > 0 ? comp.infoBits / tokens : 0;

  const metrics = {
    tokens,
    bitsPerToken,
    compressedBytes: comp.compressedBytes,
    compressionRatio: comp.ratio,
    infoBits: comp.infoBits,
    ttr: lex.ttr,
    mattr: lex.mattr,
    uniqueWords: lex.uniqueWords,
    repetitionRate: rep.repetitionRate,
    bigramRepeat: rep.bigramRepeat,
    trigramRepeat: rep.trigramRepeat,
    longestRepeatedPhrase: rep.longestRepeatedPhrase,
    fillerRate: fill.fillerRate,
    fillerCount: fill.fillerCount,
    fillerHits: fill.fillerHits,
    hedgeRate: fill.hedgeRate,
    hedgeCount: fill.hedgeCount,
  };

  const { scores, verdict } = score(metrics, opts);

  const result = {
    input: {
      chars: input.length,
      tokens,
      tokenMethod,
      sentences,
      words: lex.words,
    },
    metrics: round2(metrics),
    scores,
    verdict,
  };

  if (opts.verbatim) {
    result.verbatim = extractSignal(input, opts);
  }

  return result;
}

function round2(m) {
  const out = {};
  for (const [k, v] of Object.entries(m)) {
    out[k] = typeof v === 'number' ? Math.round(v * 1000) / 1000 : v;
  }
  return out;
}
