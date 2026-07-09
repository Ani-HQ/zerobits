// Repetition.
//
// "As I mentioned... as noted above... to reiterate..." Repeated phrasing is a
// strong tell for padding. We measure the fraction of bigrams and trigrams that
// are duplicates of an earlier one.

/**
 * @param {string} text
 * @returns {{ bigramRepeat: number, trigramRepeat: number, repetitionRate: number, longestRepeatedPhrase: string }}
 */
export function repetitionStats(text) {
  const words = (text.toLowerCase().match(/\p{L}+|\p{N}+/gu) || []);

  const ngramRepeat = (n) => {
    if (words.length < n) return 0;
    const seen = new Map();
    let total = 0;
    let repeats = 0;
    for (let i = 0; i + n <= words.length; i++) {
      const gram = words.slice(i, i + n).join(' ');
      total += 1;
      const count = seen.get(gram) || 0;
      if (count > 0) repeats += 1;
      seen.set(gram, count + 1);
    }
    return total === 0 ? 0 : repeats / total;
  };

  const bigramRepeat = ngramRepeat(2);
  const trigramRepeat = ngramRepeat(3);

  return {
    bigramRepeat,
    trigramRepeat,
    // Weighted blend; trigrams are a stronger signal than bigrams.
    repetitionRate: 0.4 * bigramRepeat + 0.6 * trigramRepeat,
    longestRepeatedPhrase: longestRepeatedPhrase(words),
  };
}

function longestRepeatedPhrase(words) {
  let best = '';
  // Cap n to keep this cheap on large inputs.
  const maxN = Math.min(12, Math.floor(words.length / 2));
  for (let n = maxN; n >= 3; n--) {
    const seen = new Set();
    for (let i = 0; i + n <= words.length; i++) {
      const gram = words.slice(i, i + n).join(' ');
      if (seen.has(gram)) return gram;
      seen.add(gram);
    }
  }
  return best;
}
