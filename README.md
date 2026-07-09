# zerobits

> Make it illegal to speak over 500 tokens in a row while providing zero bits of information.

`zerobits` measures the **information density** of text and flags the crime: long, and empty. It reads a message, a doc, a PR description, an agent's monologue — and tells you how many bits of actual information it carries per token, then strips the padding so you can read what was actually said.

Zero build. Zero required dependencies. Point any agent (or yourself) at it and it just runs.

![zerobits — one corporate all-hands email (GUILTY) vs one deploy post-mortem (CLEAR)](media/demo.gif)

## Run it (nothing to install)

```bash
git clone https://github.com/Ani-HQ/zerobits
node zerobits/bin/zerobits.js zerobits/examples/empty.txt
```

It uses only Node's built-ins (`zlib`, `fetch`), so `git clone && node bin/zerobits.js <file>` works with an empty `node_modules`. Node ≥ 18.

Or via npm once published:

```bash
npx zerobits path/to/file.md
echo "some waffle" | npx zerobits
zerobits "inline text to score"
```

## Usage

```
zerobits [file...]            analyse one or more files
zerobits "some text"          analyse a string directly
cat notes.md | zerobits       analyse piped stdin

-v, --verbatim         strip the padding, show what was actually said
-j, --judge            add a semantic pass via a cheap model (needs an API key)
    --rubric           print the judging prompt so YOUR agent judges it (no key)
    --json             machine-readable output
-t, --threshold <n>    "long" token threshold (default 500)
    --min-density <n>  low-signal cutoff, 0-100 (default 35)
    --check            exit non-zero if any input is GUILTY (CI / git hooks)
-q, --quiet            print only the verdict line
```

### `--verbatim`: cite what you actually said

The tweet's real ask. `zerobits file.md --verbatim` ranks every sentence by information contribution, drops the padding, and shows the signal:

```
what you actually said  (166 of 508 tokens — 67% was padding)
  • I wanted to circle back and touch base regarding some of the exciting things...
  • ...
```

## How it works

The verdict combines two things gzip alone can't do together:

1. **Structural information** — the genuine content is well approximated by how many bytes a compressor needs (raw DEFLATE). Filler and repetition compress away; novel content doesn't. Blended with vocabulary diversity (moving-average type-token ratio) and repeated-phrase rate.
2. **Filler tax** — corporate/AI word-salad is fluent, varied, and non-repetitive, so compression and diversity read it as "fine." A curated lexicon of ~200 filler phrases and hedges taxes the whole score, because *that's* the tell for semantic emptiness.

```
density = structural_quality × (1 − filler_tax)
```

The statute fires when a message is **over the token threshold** (default 500) **and** below the signal floor. Every constant lives in [`src/score.js`](src/score.js) and is documented — tune to taste.

### Optional: semantic judge

Compression + lexicon catch ~everything. For the last case — text that is fluent, varied, filler-free, and *still* says nothing — add a cheap model:

```bash
export ANTHROPIC_API_KEY=...   # or GEMINI_API_KEY, or OPENAI_API_KEY
zerobits file.md --judge
```

Auto-detects the provider (Claude Haiku / Gemini Flash / GPT-4o-mini), rates density, and extracts the distinct real claims. A 500-token check costs about **$0.0007** — under a tenth of a cent — and only runs on inputs you pass `--judge`.

**No key? Let your own agent judge it.** `zerobits file.md --rubric` prints a ready-to-use prompt; the LLM already driving the tool applies it. See [`AGENTS.md`](AGENTS.md) and [`RUBRIC.md`](RUBRIC.md).

## Use as a library

```js
import { analyze } from 'zerobits';

const r = await analyze(text, { threshold: 500, verbatim: true });
r.verdict.guilty;      // boolean
r.scores.density;      // 0-100
r.metrics.bitsPerToken;
r.verbatim.condensed;  // the padding-stripped version
```

`analyze()` is fully local — no network, no key.

## Gate it in CI

```bash
zerobits --check PR_DESCRIPTION.md   # exit 1 if GUILTY
```

Drop it in a pre-commit hook to keep commit messages honest, or in CI to keep PR descriptions from waffling.

## License

MIT © Ani. Built in reply to [@gabriel1](https://twitter.com/gabriel1)'s statute.
