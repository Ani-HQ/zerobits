// Filler and hedging.
//
// Compression and diversity catch structural emptiness. This catches the other
// kind: grammatically fine, non-repetitive corporate word-salad that still says
// nothing. gzip can't see it; a lexicon can.
//
// Two lists:
//   FILLER_PHRASES - business/AI boilerplate that almost never carries payload.
//   HEDGES         - softeners and intensifiers that pad without informing.

export const FILLER_PHRASES = [
  'circle back', 'circle around', 'touch base', 'reach out', 'loop in', 'loop back',
  'going forward', 'moving forward', 'at the end of the day', 'on the same page',
  'synergy', 'synergies', 'synergize', 'leverage', 'leveraging', 'low-hanging fruit',
  'low hanging fruit', 'think outside the box', 'boil the ocean', 'move the needle',
  'drill down', 'double-click', 'double click', 'deep dive', 'value add', 'value-add',
  'core competency', 'core competencies', 'best practice', 'best practices',
  'paradigm shift', 'holistic', 'streamline', 'streamlined', 'bandwidth',
  'action item', 'action items', 'actionable', 'align on', 'alignment', 'realign',
  'ecosystem', 'robust', 'scalable', 'seamless', 'seamlessly', 'cutting-edge',
  'cutting edge', 'state of the art', 'state-of-the-art', 'world-class', 'world class',
  'mission-critical', 'mission critical', 'game changer', 'game-changer', 'north star',
  'table stakes', 'take it to the next level', 'hit the ground running',
  'peel back the layers', 'unpack this', 'ideate', 'operationalize', 'incentivize',
  'socialize', 'sunset', 'in the weeds', 'boots on the ground', 'thought leadership',
  'thought leader', 'value proposition', 'win-win', 'win win', 'quick win',
  'it is important to note', "it's important to note", 'important to note',
  'needless to say', 'as previously mentioned', 'as mentioned above',
  'as mentioned earlier', 'as noted above', 'as noted', 'to reiterate',
  'in order to', 'at this point in time', 'at the present time', 'due to the fact that',
  'in the event that', 'for all intents and purposes', 'with that being said',
  'that being said', 'in conclusion', 'last but not least', 'first and foremost',
  'when it comes to', 'the fact of the matter', 'the fact of the matter is',
  "in today's world", 'in this day and age', 'a wide range of', 'a variety of',
  'in terms of', 'on a daily basis', 'in a timely manner', 'at the end of the day',
  'the bottom line', 'net-net', 'net net', 'at scale', 'best-in-class', 'best in class',
  'end-to-end', 'end to end', 'turnkey', 'frictionless', 'delight our customers',
  'customer-centric', 'customer centric', 'data-driven', 'results-driven',
  'passionate about', 'excited to', 'thrilled to', 'reimagine', 'rethink',
  'unlock value', 'drive value', 'drive impact', 'key learnings', 'learnings',
  'circle up', 'ping you', 'ping me', 'quick sync', 'sync up', 'level set',
  'level-set', 'raise the bar', 'push the envelope', 'boil down', 'at a high level',
  'high-level overview', 'strategic imperative', 'core focus', 'laser focus',
  'laser-focused', 'move fast', 'iterate quickly', 'you know', 'i mean',
];

export const HEDGES = [
  'kind of', 'sort of', 'a bit', 'a little', 'somewhat', 'arguably', 'perhaps',
  'maybe', 'possibly', 'basically', 'essentially', 'fundamentally', 'literally',
  'actually', 'honestly', 'frankly', 'to be honest', 'to be fair', 'in my opinion',
  'i think', 'i feel like', 'i guess', 'i believe', 'it seems', 'it appears',
  'more or less', 'for the most part', 'in general', 'generally speaking', 'really',
  'very', 'quite', 'rather', 'just', 'simply', 'truly', 'clearly', 'obviously',
  'of course', 'as you can imagine', 'as you might expect', 'if you will',
  'so to speak', 'at the end of the day',
];

// Longest phrases first so multi-word matches win before their sub-words.
const byLength = (a, b) => b.length - a.length;
const FILLER_SORTED = [...FILLER_PHRASES].sort(byLength);
const HEDGE_SORTED = [...HEDGES].sort(byLength);

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countPhrases(text, phrases) {
  const lower = text.toLowerCase();
  const hits = [];
  let total = 0;
  for (const phrase of phrases) {
    // Word-boundary match, whitespace-insensitive between words.
    const pattern = escapeRegExp(phrase).replace(/\\?\s+/g, '\\s+');
    const re = new RegExp(`(?<![\\p{L}])${pattern}(?![\\p{L}])`, 'giu');
    const matches = lower.match(re);
    if (matches && matches.length) {
      total += matches.length;
      hits.push({ phrase, count: matches.length });
    }
  }
  hits.sort((a, b) => b.count - a.count);
  return { total, hits };
}

/**
 * @param {string} text
 * @param {number} tokens - token count, used to normalise to a per-100-token rate
 * @returns {{
 *   fillerHits: {phrase: string, count: number}[],
 *   fillerCount: number,
 *   fillerRate: number,
 *   hedgeCount: number,
 *   hedgeRate: number
 * }}
 */
export function fillerStats(text, tokens) {
  const filler = countPhrases(text, FILLER_SORTED);
  const hedge = countPhrases(text, HEDGE_SORTED);
  const per100 = (n) => (tokens > 0 ? (n / tokens) * 100 : 0);
  return {
    fillerHits: filler.hits,
    fillerCount: filler.total,
    fillerRate: per100(filler.total),
    hedgeCount: hedge.total,
    hedgeRate: per100(hedge.total),
  };
}
