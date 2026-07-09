// Scoring.
//
// Combine the raw metrics into a single 0-100 density score, then apply the statute:
//
//   §500 - Speaking 500+ tokens while conveying ~zero bits of information.
//
// Model: structural quality x (1 - filler tax).
//
//   structural = how much genuine structure the text has, from compression-based
//                information content, vocabulary diversity, and lack of repetition.
//   filler tax = corporate/AI word-salad and hedging drag the WHOLE score down,
//                because a passage can be fluent, varied, non-repetitive AND still
//                say nothing. Compression and diversity can't see that; the tax can.
//
// Every constant is a documented, tunable heuristic. Nothing is magic.

/** Central tuning knobs. */
export const DEFAULTS = {
  threshold: 500,   // token count above which a message is "long"
  minDensity: 35,   // density below which a long message is "low signal"
  bitsFloor: 5,     // bits/token below which content is near-empty regardless of score

  // Sub-score calibration (empirical, from gzip/tiktoken behaviour on English prose).
  bitsPerToken: { min: 6, max: 20 },   // compressed information per token
  ratio: { min: 0.3, max: 0.7 },       // deflate ratio; lower = more redundant padding
  mattr: { min: 0.4, max: 0.85 },      // vocabulary diversity band

  // Filler tax: fillerRate/hedgeRate are per-100-token counts.
  fillerScale: 20,   // filler hits/100 tokens that roughly zero out the score
  hedgeScale: 40,    // hedges are softer than hard business filler
  minMultiplier: 0.1,

  // Structural blend (sums to 1).
  weights: { entropy: 0.45, diversity: 0.2, repetition: 0.35 },
};

const clamp = (x, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));
const lerp = (x, min, max) => ((x - min) / (max - min)) * 100;

/**
 * @param {object} metrics - merged output of the raw metric modules
 * @param {object} [opts]
 * @returns {{ scores: object, verdict: object }}
 */
export function score(metrics, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const w = { ...DEFAULTS.weights, ...(opts.weights || {}) };

  // Entropy = blend of raw information-per-token and redundancy (compression ratio).
  const bitsScore = clamp(lerp(metrics.bitsPerToken, cfg.bitsPerToken.min, cfg.bitsPerToken.max));
  const ratioScore = clamp(lerp(metrics.compressionRatio, cfg.ratio.min, cfg.ratio.max));
  const entropy = 0.5 * bitsScore + 0.5 * ratioScore;

  const diversity = clamp(lerp(metrics.mattr, cfg.mattr.min, cfg.mattr.max));
  const repetition = clamp(100 * (1 - metrics.repetitionRate));

  const structural = clamp(
    w.entropy * entropy + w.diversity * diversity + w.repetition * repetition,
  );

  // Filler tax multiplier — drags the whole structural score down.
  const multiplier = clamp(
    1 - metrics.fillerRate / cfg.fillerScale - metrics.hedgeRate / cfg.hedgeScale,
    cfg.minMultiplier,
    1,
  );
  const filler = multiplier * 100;
  const density = clamp(structural * multiplier);

  const overLimit = metrics.tokens > cfg.threshold;
  const lowSignal = density < cfg.minDensity || metrics.bitsPerToken < cfg.bitsFloor;

  let code, ruling;
  if (overLimit && lowSignal) {
    code = 'GUILTY';
    ruling = `${metrics.tokens} tokens, ${round(density)}/100 signal. Illegal under §500: 500+ tokens, ~zero bits of information.`;
  } else if (overLimit && !lowSignal) {
    code = 'ACQUITTED';
    ruling = `${metrics.tokens} tokens, but ${round(density)}/100 signal — long, and it earns the length.`;
  } else if (!overLimit && lowSignal) {
    code = 'WARNING';
    ruling = `Under the 500-token limit, but only ${round(density)}/100 signal. Thin, just short.`;
  } else {
    code = 'CLEAR';
    ruling = `${metrics.tokens} tokens, ${round(density)}/100 signal. Within limits.`;
  }

  return {
    scores: {
      entropy: round(entropy),
      diversity: round(diversity),
      repetition: round(repetition),
      filler: round(filler),
      density: round(density),
    },
    verdict: {
      code,
      guilty: code === 'GUILTY',
      ruling,
      overLimit,
      lowSignal,
      threshold: cfg.threshold,
      minDensity: cfg.minDensity,
    },
  };
}

function round(x) {
  return Math.round(x * 10) / 10;
}
