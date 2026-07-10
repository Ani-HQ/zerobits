// Optional semantic judge.
//
// The local metrics catch structural emptiness and filler. A cheap model catches
// the last case: text that is fluent, varied, non-repetitive AND still says
// nothing. This is opt-in (`--judge`) and only runs if an API key is present.
//
// Provider is auto-detected from the environment, in this order:
//   ANTHROPIC_API_KEY -> Claude Haiku      ($1 / $5 per 1M tokens)
//   GEMINI_API_KEY    -> Gemini Flash
//   OPENAI_API_KEY    -> GPT-4o-mini
//
// No SDKs — just fetch() against each provider's REST endpoint, so the zero-
// dependency promise holds. If you'd rather have the agent that's already driving
// zerobits do the judging (no key needed), see RUBRIC.md and `--rubric`.

export const RUBRIC = `You are a strict information-density auditor.
Rate the passage 0-100 on how much genuine information it conveys per token:
 - 0-20   = corporate/AI word-salad, says essentially nothing
 - 21-50  = some content buried in padding
 - 51-80  = mostly substantive
 - 81-100 = dense, every sentence earns its place
Then list the distinct, non-obvious claims or facts it actually makes (verbatim
or tightly paraphrased). If there are none, return an empty list.
Respond ONLY with minified JSON of the shape:
{"score": <int 0-100>, "verdict": "<one short sentence>", "novel_claims": ["..."]}`;

export function detectProvider(env = process.env) {
  if (env.ZEROBITS_PROVIDER) return env.ZEROBITS_PROVIDER;
  if (env.ANTHROPIC_API_KEY) return 'anthropic';
  if (env.GEMINI_API_KEY || env.GOOGLE_API_KEY) return 'gemini';
  if (env.OPENAI_API_KEY) return 'openai';
  return null;
}

/**
 * Build the ready-to-paste judging prompt (used by `--rubric` so a calling agent
 * can do the semantic pass itself without any API key).
 * @param {string} text
 * @returns {string}
 */
export function buildPrompt(text) {
  return `${RUBRIC}\n\n--- PASSAGE START ---\n${text}\n--- PASSAGE END ---`;
}

/**
 * Run the semantic judge against a hosted model.
 * @param {string} text
 * @param {object} [opts]
 * @returns {Promise<{provider: string, model: string, score: number, verdict: string, novelClaims: string[]}>}
 */
export async function judge(text, opts = {}) {
  const env = opts.env || process.env;
  const provider = opts.provider || detectProvider(env);
  if (!provider) {
    throw new Error(
      'No API key found. Set ANTHROPIC_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY — ' +
        'or drop --judge and use `--rubric` to let your own agent judge it.',
    );
  }
  const prompt = buildPrompt(text);
  const timeoutMs = opts.timeoutMs || (Number(env.ZEROBITS_TIMEOUT) || 30) * 1000;
  let raw, model;
  if (provider === 'anthropic') {
    ({ raw, model } = await callAnthropic(prompt, env, opts, timeoutMs));
  } else if (provider === 'gemini') {
    ({ raw, model } = await callGemini(prompt, env, opts, timeoutMs));
  } else if (provider === 'openai') {
    ({ raw, model } = await callOpenAI(prompt, env, opts, timeoutMs));
  } else {
    throw new Error(`Unknown provider: ${provider}`);
  }
  const parsed = parseJudge(raw);
  return {
    provider,
    model,
    score: parsed.score,
    verdict: parsed.verdict,
    novelClaims: parsed.novel_claims || [],
  };
}

// fetch() with a hard timeout, so a stalled provider can't hang the CLI.
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`judge request timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function callAnthropic(prompt, env, opts, timeoutMs) {
  const model = opts.model || env.ZEROBITS_MODEL || 'claude-haiku-4-5';
  const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    }),
  }, timeoutMs);
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const raw = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { raw, model };
}

async function callGemini(prompt, env, opts, timeoutMs) {
  const model = opts.model || env.ZEROBITS_MODEL || 'gemini-2.5-flash';
  const key = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
    }),
  }, timeoutMs);
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  return { raw, model };
}

async function callOpenAI(prompt, env, opts, timeoutMs) {
  const model = opts.model || env.ZEROBITS_MODEL || 'gpt-4o-mini';
  const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    }),
  }, timeoutMs);
  if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || '';
  return { raw, model };
}

function parseJudge(raw) {
  const cleaned = String(raw).replace(/```json\s*|\s*```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        // fall through
      }
    }
    throw new Error(`Judge returned unparseable output: ${raw.slice(0, 200)}`);
  }
}
