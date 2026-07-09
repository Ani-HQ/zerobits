# AGENTS.md — using zerobits from an AI agent

This file is for coding agents (Claude Code, Codex, Gemini, Cowork, OpenClaw, or any
tool-using LLM) pointed at this repo. It tells you exactly how to run the tool and
read its output. Humans: see [README.md](README.md).

## What it does

`zerobits` scores the **information density** of text and flags long-but-empty
passages ("500+ tokens, ~zero bits of information"). Use it to check your own
output, a user's draft, a PR description, or any text before acting on it.

## Run it — no install, no build, no key

The core is pure Node built-ins. From the repo root:

```bash
node bin/zerobits.js <file>              # analyse a file
node bin/zerobits.js "text to score"     # analyse a string
echo "$TEXT" | node bin/zerobits.js -    # analyse stdin
```

Requires Node ≥ 18. There is nothing to `npm install` for local scoring.

## Get machine-readable output

Always pass `--json` when you're parsing the result programmatically:

```bash
node bin/zerobits.js <file> --json
```

### Result schema

```jsonc
{
  "input":   { "chars", "tokens", "tokenMethod", "sentences", "words" },
  "metrics": {
    "tokens", "bitsPerToken", "compressedBytes", "compressionRatio", "infoBits",
    "ttr", "mattr", "uniqueWords",
    "repetitionRate", "bigramRepeat", "trigramRepeat", "longestRepeatedPhrase",
    "fillerRate", "fillerCount", "fillerHits": [{ "phrase", "count" }],
    "hedgeRate", "hedgeCount"
  },
  "scores":  { "entropy", "diversity", "repetition", "filler", "density" }, // each 0-100
  "verdict": {
    "code": "GUILTY | WARNING | ACQUITTED | CLEAR",
    "guilty": true,           // the field to branch on
    "ruling": "human sentence",
    "overLimit": true,        // tokens > threshold
    "lowSignal": true,        // density below floor
    "threshold": 500,
    "minDensity": 35
  }
}
```

`verdict.guilty === true` means: over the token threshold **and** below the signal
floor. That's the one boolean to gate on.

## Exit codes (for gating)

By default the tool exits `0`. With `--check` it exits `1` if any input is GUILTY —
use this to fail a CI step or block a commit:

```bash
node bin/zerobits.js --check PR_BODY.md
```

## The semantic pass — you can do it yourself, no API key

Local metrics catch structural emptiness and filler. The remaining case (fluent,
varied, filler-free, still vacuous) needs a language model — and **you are one.**

1. Run `node bin/zerobits.js <file> --rubric`. It prints a ready-to-use judging
   prompt (the passage wrapped in [RUBRIC.md](RUBRIC.md)).
2. Answer that prompt yourself. Return the JSON it asks for:
   `{"score": <0-100>, "verdict": "...", "novel_claims": ["..."]}`.
3. Combine your semantic score with the tool's local `scores.density` for a final call.

If you'd rather a hosted model do it, set `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, or
`OPENAI_API_KEY` and pass `--judge` instead — the result appears under `result.judge`.

## Suggested workflow

```
1. node bin/zerobits.js draft.md --json    → read verdict.guilty and scores.density
2. if guilty:  node bin/zerobits.js draft.md --verbatim   → see what's actually there
3. rewrite keeping only the signal, or run --rubric and judge the meaning yourself
```
