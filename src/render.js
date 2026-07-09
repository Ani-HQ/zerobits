// Rendering. Human-readable report + machine JSON. No dependencies.

const VERDICT_STYLE = {
  GUILTY: { color: 'red', label: 'GUILTY', emoji: '🚫' },
  WARNING: { color: 'yellow', label: 'WARNING', emoji: '⚠️ ' },
  ACQUITTED: { color: 'cyan', label: 'ACQUITTED', emoji: '✅' },
  CLEAR: { color: 'green', label: 'CLEAR', emoji: '✅' },
};

const CODES = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m', gray: '\x1b[90m',
};

function makeColorizer(enabled) {
  if (!enabled) return (s) => s;
  return (s, ...styles) => styles.map((st) => CODES[st] || '').join('') + s + CODES.reset;
}

function bar(value, width = 24) {
  const filled = Math.round((value / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

/**
 * @param {object} result - output of analyze() (optionally with a `.judge` field)
 * @param {object} [opts]
 * @param {boolean} [opts.color]
 * @returns {string}
 */
export function renderHuman(result, opts = {}) {
  const color = opts.color ?? true;
  const c = makeColorizer(color);
  const { input, metrics, scores, verdict } = result;
  const style = VERDICT_STYLE[verdict.code] || VERDICT_STYLE.CLEAR;

  const lines = [];
  lines.push('');
  lines.push(c('  zerobits', 'bold', 'blue') + c('  ·  information density audit', 'dim'));
  lines.push('');

  // Verdict banner.
  lines.push(
    `  ${style.emoji} ` + c(` ${style.label} `, 'bold', style.color) + '  ' + verdict.ruling,
  );
  lines.push('');

  // Density headline.
  lines.push(
    `  signal   ${c(bar(scores.density), style.color)}  ${c(String(scores.density) + '/100', 'bold')}`,
  );
  lines.push('');

  // Sub-scores.
  const sub = [
    ['entropy  ', scores.entropy, 'compressed information content'],
    ['diversity', scores.diversity, 'distinct vocabulary'],
    ['non-repeat', scores.repetition, 'lack of repeated phrasing'],
    ['no-filler', scores.filler, 'freedom from corporate filler'],
  ];
  for (const [name, val, note] of sub) {
    lines.push(`  ${name} ${c(bar(val, 18), 'gray')} ${String(val).padStart(5)}  ${c(note, 'dim')}`);
  }
  lines.push('');

  // Facts.
  lines.push(c('  the numbers', 'dim'));
  const facts = [
    ['tokens', `${input.tokens}${input.tokenMethod === 'estimate' ? ' (est.)' : ''}`],
    ['bits / token', metrics.bitsPerToken.toFixed(2)],
    ['compressible to', `${Math.round(metrics.compressionRatio * 100)}% of size`],
    ['unique vocab', `${Math.round(metrics.mattr * 100)}%`],
    ['filler phrases', `${metrics.fillerCount} (${metrics.fillerRate.toFixed(1)}/100 tok)`],
    ['hedges', `${metrics.hedgeCount}`],
  ];
  for (const [k, v] of facts) {
    lines.push(`    ${c((k + ':').padEnd(18), 'gray')} ${v}`);
  }

  if (metrics.fillerHits && metrics.fillerHits.length) {
    const top = metrics.fillerHits.slice(0, 6).map((h) => `"${h.phrase}"${h.count > 1 ? '×' + h.count : ''}`);
    lines.push(`    ${c('caught:'.padEnd(18), 'gray')} ${top.join(', ')}`);
  }

  // Verbatim.
  if (result.verbatim) {
    const v = result.verbatim;
    lines.push('');
    lines.push(c('  what you actually said', 'dim') + c(`  (${v.tokensAfter} of ${v.tokensBefore} tokens — ${v.savedPct}% was padding)`, 'dim'));
    for (const s of v.keptSentences) {
      lines.push(`    ${c('•', style.color)} ${s}`);
    }
  }

  // Judge.
  if (result.judge) {
    const j = result.judge;
    lines.push('');
    lines.push(c(`  semantic judge`, 'dim') + c(`  (${j.provider}/${j.model})`, 'dim'));
    lines.push(`    ${c('score:'.padEnd(18), 'gray')} ${j.score}/100 — ${j.verdict}`);
    if (j.novelClaims.length) {
      lines.push(`    ${c('real claims:'.padEnd(18), 'gray')} ${j.novelClaims.length}`);
      for (const claim of j.novelClaims.slice(0, 8)) {
        lines.push(`      ${c('-', style.color)} ${claim}`);
      }
    } else {
      lines.push(`    ${c('real claims:'.padEnd(18), 'gray')} none`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

export function renderJson(result) {
  return JSON.stringify(result, null, 2);
}
