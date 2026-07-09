// Token counting.
//
// Zero-dependency estimate by default so `git clone && node bin/zerobits.js` runs
// with nothing installed. If `gpt-tokenizer` happens to be installed, we use it for
// an exact cl100k count instead.

/**
 * Estimate the token count of a string without any dependency.
 *
 * Splits the text into cl100k-style "pre-tokens" (leading-space-attached word,
 * number, and punctuation runs) and applies a small sub-word expansion factor,
 * because rarer/longer words split into more than one BPE token. In practice this
 * lands within ~10-15% of tiktoken for normal English prose, which is plenty for
 * a threshold like "500 tokens".
 *
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  if (!text) return 0;
  const matches = text.match(/'(?:[sdmt]|ll|ve|re)| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+/gu);
  if (!matches) return 0;

  let pieces = 0;
  for (const m of matches) {
    if (m.trim() === '') continue; // whitespace runs are handled below
    pieces += 1;
  }
  const newlines = (text.match(/\n/g) || []).length;
  return Math.round(pieces * 1.15) + newlines;
}

/**
 * Count tokens, preferring an exact tokenizer if one is installed.
 *
 * @param {string} text
 * @returns {Promise<{ count: number, method: 'gpt-tokenizer' | 'estimate' }>}
 */
export async function countTokens(text) {
  try {
    const mod = await import('gpt-tokenizer');
    const encode = mod.encode || mod.default?.encode;
    if (typeof encode === 'function') {
      return { count: encode(text).length, method: 'gpt-tokenizer' };
    }
  } catch {
    // gpt-tokenizer not installed — fall through to the estimate.
  }
  return { count: estimateTokens(text), method: 'estimate' };
}
