export type When = 'always' | 'failures';

/** Options for the Blipr reporter. Each one falls back to a `BLIPR_*` env var. */
export interface BliprReporterOptions {
  /** Topic to send to: `my-topic` or a protected `@handle/topic`. Env: `BLIPR_TOPIC`. */
  topic?: string;
  /** Blipr server. Env: `BLIPR_SERVER`. Default `https://blipr.dev`. */
  server?: string;
  /** Access token, sent as a Bearer token. Env: `BLIPR_TOKEN`. */
  token?: string;
  /** `always` (default) or `failures`. Env: `BLIPR_WHEN`. */
  when?: When;
  /** Runs shorter than this many seconds send nothing. Env: `BLIPR_MIN_DURATION`. Default 30. */
  minDuration?: number;
  /** How long to wait for the server, in milliseconds. Env: `BLIPR_TIMEOUT`. Default 5000. */
  timeout?: number;
  /** Name shown in the blip title. Env: `BLIPR_TITLE`. Default: the project folder name. */
  title?: string;
  /** URL opened when the blip is tapped. Env: `BLIPR_CLICK`. Default on GitHub Actions: the run. */
  click?: string;
  /** Print the request instead of sending it. Env: `BLIPR_DRY_RUN`. */
  dryRun?: boolean;
}

export interface ResolvedOptions {
  topic?: string;
  server: string;
  token?: string;
  when: When;
  minDuration: number;
  timeout: number;
  title?: string;
  click?: string;
  dryRun: boolean;
}

export type Env = Record<string, string | undefined>;

export const DEFAULT_SERVER = 'https://blipr.dev';
const DEFAULT_MIN_DURATION = 30;
const DEFAULT_TIMEOUT = 5000;

function pick(value: string | undefined, env: Env, name: string): string | undefined {
  const v = value ?? env[name];
  return v == null || v.trim() === '' ? undefined : v.trim();
}

function number(value: number | undefined, raw: string | undefined, fallback: number): number {
  const n = value ?? (raw == null ? NaN : Number(raw));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function flag(value: boolean | undefined, raw: string | undefined): boolean {
  if (value != null) return value;
  return ['1', 'true', 'yes'].includes((raw ?? '').trim().toLowerCase());
}

function when(value: string | undefined): When {
  return value?.toLowerCase() === 'failures' ? 'failures' : 'always';
}

/** The GitHub Actions run URL, when the runner's variables are present. */
export function githubRunUrl(env: Env): string | undefined {
  const { GITHUB_SERVER_URL: host, GITHUB_REPOSITORY: repo, GITHUB_RUN_ID: run } = env;
  if (!host || !repo || !run) return undefined;
  return `${host}/${repo}/actions/runs/${run}`;
}

/** Merge reporter options over env vars over defaults. */
export function resolveOptions(opts: BliprReporterOptions, env: Env): ResolvedOptions {
  return {
    topic: pick(opts.topic, env, 'BLIPR_TOPIC'),
    server: (pick(opts.server, env, 'BLIPR_SERVER') ?? DEFAULT_SERVER).replace(/\/+$/, ''),
    token: pick(opts.token, env, 'BLIPR_TOKEN'),
    when: when(pick(opts.when, env, 'BLIPR_WHEN')),
    minDuration: number(opts.minDuration, env.BLIPR_MIN_DURATION, DEFAULT_MIN_DURATION),
    timeout: number(opts.timeout, env.BLIPR_TIMEOUT, DEFAULT_TIMEOUT),
    title: pick(opts.title, env, 'BLIPR_TITLE'),
    click: pick(opts.click, env, 'BLIPR_CLICK') ?? githubRunUrl(env),
    dryRun: flag(opts.dryRun, env.BLIPR_DRY_RUN),
  };
}
