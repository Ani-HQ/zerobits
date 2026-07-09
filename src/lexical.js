// Lexical diversity.
//
// How much of the vocabulary is actually distinct? Empty text reuses the same
// small set of words; dense text keeps introducing new ones.
//
//   TTR   - type/token ratio (unique words / total words). Simple, but drops as
//           text gets longer even when quality is constant.
//   MATTR - moving-average TTR over a sliding window. Length-independent, so it's
//           the one we feed into the score.

/**
 * @param {string} text
 * @param {number} [windowSize=50]
 * @returns {{ words: number, uniqueWords: number, ttr: number, mattr: number }}
 */
export function lexicalStats(text, windowSize = 50) {
  const words = (text.toLowerCase().match(/\p{L}+/gu) || []);
  const total = words.length;
  if (total === 0) {
    return { words: 0, uniqueWords: 0, ttr: 0, mattr: 0 };
  }

  const uniqueWords = new Set(words).size;
  const ttr = uniqueWords / total;

  let mattr;
  if (total <= windowSize) {
    mattr = ttr;
  } else {
    let sum = 0;
    let windows = 0;
    for (let i = 0; i + windowSize <= total; i++) {
      const window = words.slice(i, i + windowSize);
      sum += new Set(window).size / windowSize;
      windows += 1;
    }
    mattr = sum / windows;
  }

  return { words: total, uniqueWords, ttr, mattr };
}
