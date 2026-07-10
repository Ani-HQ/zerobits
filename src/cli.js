// CLI entrypoint logic (invoked by bin/zerobits.js).

import fs from 'node:fs';
import { analyze } from './index.js';
import { judge, buildPrompt } from './judge.js';
import { renderHuman, renderJson } from './render.js';

const HELP = `zerobits — measure the information density of text

USAGE
  zerobits [file...]            analyse one or more files
  zerobits "some text"          analyse a string directly
  cat notes.md | zerobits       analyse piped stdin
  zerobits -                    read stdin explicitly

OPTIONS
  -v, --verbatim         strip the padding, show what was actually said
  -j, --judge            add a semantic pass via a cheap model (needs an API key)
      --rubric           print the judging prompt so YOUR agent can judge it (no key)
      --json             machine-readable output
  -t, --threshold <n>    "long" token threshold (default 500)
      --min-density <n>  low-signal cutoff, 0-100 (default 35)
      --check            exit non-zero if any input is GUILTY (for CI / git hooks)
      --provider <name>  force judge provider: anthropic | gemini | openai
      --model <id>       override the judge model
      --timeout <s>      judge request timeout in seconds (default 30)
      --no-color         disable ANSI colour
  -q, --quiet            print only the verdict line
  -h, --help             show this help
  -V, --version          show version

JUDGE KEYS (auto-detected, in order)
  ANTHROPIC_API_KEY -> Claude Haiku      GEMINI_API_KEY -> Gemini Flash
  OPENAI_API_KEY    -> GPT-4o-mini

  §500 — speaking 500+ tokens while providing ~zero bits of information.`;

const VERSION = JSON.parse(
  fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version;

export async function run(argv) {
  const opts = parseArgs(argv);
  if (opts.help) {
    process.stdout.write(HELP + '\n');
    return 0;
  }
  if (opts.version) {
    process.stdout.write(VERSION + '\n');
    return 0;
  }

  const inputs = await resolveInputs(opts);
  if (inputs.length === 0) {
    process.stderr.write('zerobits: no input. Pass a file, a string, or pipe stdin. See --help.\n');
    return 2;
  }

  const color = opts.color && process.stdout.isTTY && !process.env.NO_COLOR;
  let guiltyCount = 0;
  const jsonResults = [];

  for (const item of inputs) {
    if (opts.rubric) {
      process.stdout.write(buildPrompt(item.text) + '\n');
      continue;
    }

    const result = await analyze(item.text, {
      threshold: opts.threshold,
      minDensity: opts.minDensity,
      verbatim: opts.verbatim,
    });
    result.source = item.name;

    if (opts.judge) {
      try {
        result.judge = await judge(item.text, {
          provider: opts.provider,
          model: opts.model,
          timeoutMs: opts.timeout ? opts.timeout * 1000 : undefined,
        });
      } catch (err) {
        result.judge = { error: err.message };
        process.stderr.write(`zerobits: judge skipped — ${err.message}\n`);
      }
    }

    if (result.verdict.guilty) guiltyCount += 1;

    if (opts.json) {
      jsonResults.push(result);
    } else if (opts.quiet) {
      const tag = inputs.length > 1 ? `${item.name}: ` : '';
      process.stdout.write(`${tag}${result.verdict.code} — ${result.verdict.ruling}\n`);
    } else {
      if (inputs.length > 1) process.stdout.write(`\n\x1b[2m── ${item.name} ──\x1b[0m\n`);
      process.stdout.write(renderHuman(result, { color }) + '\n');
    }
  }

  if (opts.json && !opts.rubric) {
    process.stdout.write(renderJson(inputs.length === 1 ? jsonResults[0] : jsonResults) + '\n');
  }

  if (opts.check && guiltyCount > 0) return 1;
  return 0;
}

function parseArgs(argv) {
  const opts = {
    files: [],
    threshold: 500,
    minDensity: 35,
    verbatim: false,
    judge: false,
    rubric: false,
    json: false,
    quiet: false,
    check: false,
    color: true,
    provider: undefined,
    model: undefined,
    timeout: undefined,
    help: false,
    version: false,
    stdin: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '-h': case '--help': opts.help = true; break;
      case '-V': case '--version': opts.version = true; break;
      case '-v': case '--verbatim': opts.verbatim = true; break;
      case '-j': case '--judge': opts.judge = true; break;
      case '--rubric': opts.rubric = true; break;
      case '--json': opts.json = true; break;
      case '-q': case '--quiet': opts.quiet = true; break;
      case '--check': opts.check = true; break;
      case '--no-color': opts.color = false; break;
      case '-t': case '--threshold': opts.threshold = Number(argv[++i]); break;
      case '--min-density': opts.minDensity = Number(argv[++i]); break;
      case '--provider': opts.provider = argv[++i]; break;
      case '--model': opts.model = argv[++i]; break;
      case '--timeout': opts.timeout = Number(argv[++i]); break;
      case '-': opts.stdin = true; break;
      default:
        if (a.startsWith('--threshold=')) opts.threshold = Number(a.split('=')[1]);
        else if (a.startsWith('--min-density=')) opts.minDensity = Number(a.split('=')[1]);
        else if (a.startsWith('--provider=')) opts.provider = a.split('=')[1];
        else if (a.startsWith('--model=')) opts.model = a.split('=')[1];
        else if (a.startsWith('--timeout=')) opts.timeout = Number(a.split('=')[1]);
        else if (a.startsWith('-') && a.length > 1 && !/^-\d/.test(a)) {
          process.stderr.write(`zerobits: unknown option ${a}\n`);
        } else {
          opts.files.push(a);
        }
    }
  }
  return opts;
}

async function resolveInputs(opts) {
  const inputs = [];

  // Explicit or piped stdin.
  const wantStdin = opts.stdin || (opts.files.length === 0 && !process.stdin.isTTY);
  if (wantStdin) {
    const text = await readStdin();
    if (text.trim()) inputs.push({ name: 'stdin', text });
  }

  for (const f of opts.files) {
    if (isReadableFile(f)) {
      inputs.push({ name: f, text: fs.readFileSync(f, 'utf8') });
    } else {
      // Not a file — treat the argument as literal text.
      inputs.push({ name: 'text', text: f });
    }
  }

  return inputs;
}

function isReadableFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}
