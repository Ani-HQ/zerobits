import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { analyze } from '../src/index.js';
import { estimateTokens } from '../src/tokens.js';
import { compressionStats } from '../src/compression.js';
import { fillerStats } from '../src/filler.js';
import { splitSentences, extractSignal } from '../src/verbatim.js';
import { buildPrompt, detectProvider } from '../src/judge.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, '..', 'examples', name), 'utf8');
const EMPTY = read('empty.txt');
const DENSE = read('dense.txt');

test('estimateTokens grows with length and handles empty', () => {
  assert.equal(estimateTokens(''), 0);
  assert.ok(estimateTokens('hello world') >= 2);
  assert.ok(estimateTokens(DENSE) > estimateTokens('hello world'));
});

test('compression: redundant text compresses harder than dense text', () => {
  const repetitive = 'buffalo '.repeat(200);
  const varied = DENSE;
  assert.ok(compressionStats(repetitive).ratio < compressionStats(varied).ratio);
});

test('filler lexicon catches corporate word-salad, not technical prose', () => {
  const empty = fillerStats(EMPTY, estimateTokens(EMPTY));
  const dense = fillerStats(DENSE, estimateTokens(DENSE));
  assert.ok(empty.fillerCount > 10, `expected many filler hits, got ${empty.fillerCount}`);
  assert.equal(dense.fillerCount, 0);
});

test('analyze: empty corporate email is GUILTY', async () => {
  const r = await analyze(EMPTY);
  assert.equal(r.verdict.code, 'GUILTY');
  assert.equal(r.verdict.guilty, true);
  assert.ok(r.input.tokens > 500);
  assert.ok(r.scores.density < 35, `density ${r.scores.density} should be < 35`);
});

test('analyze: dense technical text is not guilty and scores high', async () => {
  const r = await analyze(DENSE);
  assert.equal(r.verdict.guilty, false);
  assert.ok(r.scores.density > 70, `density ${r.scores.density} should be > 70`);
});

test('analyze: dense text ranks far above empty text', async () => {
  const empty = await analyze(EMPTY);
  const dense = await analyze(DENSE);
  assert.ok(dense.scores.density - empty.scores.density > 40);
});

test('threshold is configurable', async () => {
  const short = 'The cache key is derived from the exact bytes of the rendered prompt.';
  const r = await analyze(short, { threshold: 5 });
  assert.equal(r.verdict.overLimit, true);
});

test('splitSentences unwraps soft line-wraps but keeps real sentences', () => {
  const wrapped = 'This is one sentence that happens\nto be hard wrapped across lines. And here is a second.';
  const s = splitSentences(wrapped);
  assert.equal(s.length, 2);
  assert.ok(s[0].includes('hard wrapped across lines'));
});

test('verbatim extraction reports padding for empty text', () => {
  const v = extractSignal(EMPTY);
  assert.ok(v.savedPct > 0);
  assert.ok(v.tokensAfter < v.tokensBefore);
  assert.ok(v.keptSentences.length >= 1);
});

test('buildPrompt embeds the passage and rubric', () => {
  const p = buildPrompt('hello');
  assert.ok(p.includes('hello'));
  assert.ok(p.toLowerCase().includes('information-density'));
});

test('detectProvider follows key precedence', () => {
  assert.equal(detectProvider({ ANTHROPIC_API_KEY: 'x' }), 'anthropic');
  assert.equal(detectProvider({ GEMINI_API_KEY: 'x' }), 'gemini');
  assert.equal(detectProvider({ OPENAI_API_KEY: 'x' }), 'openai');
  assert.equal(detectProvider({ ZEROBITS_PROVIDER: 'gemini', ANTHROPIC_API_KEY: 'x' }), 'gemini');
  assert.equal(detectProvider({}), null);
});
