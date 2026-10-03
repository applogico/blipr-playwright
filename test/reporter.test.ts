import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import BliprReporter from '../src/index';
import { formatDuration } from '../src/format';
import { config, fakeSuite, fakeTest, run, stubFetch } from './helpers';

const PASSING = [fakeTest('logs in', 'expected'), fakeTest('logs out', 'expected')];
const MIXED = [
  fakeTest('logs in', 'expected'),
  fakeTest('pays', 'unexpected', 'chromium', ['checkout']),
  fakeTest('retries', 'flaky'),
  fakeTest('later', 'skipped'),
];

let warn: MockInstance<typeof console.warn>;
let log: MockInstance<typeof console.log>;

beforeEach(() => {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('BLIPR_') || key.startsWith('GITHUB_')) vi.stubEnv(key, '');
  }
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('messages', () => {
  it('sends a passed run at priority 3', async () => {
    const sent = stubFetch();
    await run({ topic: 'builds' }, PASSING, { duration: 95_000 });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe('https://blipr.dev/blip/builds');
    expect(sent[0]?.headers['Content-Type']).toBe('application/json');
    expect(sent[0]?.body).toEqual({
      title: 'Tests passed: my-app',
      message: '2 passed, 0 failed, 0 skipped, 0 flaky in 1m 35s',
      priority: 3,
      tags: ['white_check_mark'],
    });
  });

  it('sends a failed run at priority 4 with counts and failed titles', async () => {
    const sent = stubFetch();
    await run({ topic: 'builds' }, MIXED, { status: 'failed' });
    expect(sent[0]?.body).toMatchObject({
      title: 'Tests failed: my-app',
      message: '1 passed, 1 failed, 1 skipped, 1 flaky in 1m 0s\n\n✗ [chromium] checkout › pays',
      priority: 4,
      tags: ['x'],
    });
  });

  it('says when the run timed out', async () => {
    const sent = stubFetch();
    await run({ topic: 'builds' }, PASSING, { status: 'timedout' });
    expect(sent[0]?.body).toMatchObject({ title: 'Tests timed out: my-app', priority: 4 });
  });

  it('lists up to 3 failed titles, then "and N more"', async () => {
    const sent = stubFetch();
    const tests = ['a', 'b', 'c', 'd', 'e'].map((t) => fakeTest(t, 'unexpected'));
    await run({ topic: 'builds' }, tests, { status: 'failed' });
    expect(sent[0]?.body.message).toBe(
      '0 passed, 5 failed, 0 skipped, 0 flaky in 1m 0s\n\n✗ a\n✗ b\n✗ c\nand 2 more',
    );
  });

  it('counts errors outside tests', async () => {
    const sent = stubFetch();
    await run({ topic: 'builds' }, [], { status: 'failed' }, 2);
    expect(sent[0]?.body.message).toBe('0 passed, 0 failed, 0 skipped, 0 flaky in 1m 0s\n2 errors outside tests');
    await run({ topic: 'builds' }, [], { status: 'failed' }, 1);
    expect(sent[1]?.body.message).toContain('\n1 error outside tests');
  });

  it('formats durations', () => {
    expect(formatDuration(4_400)).toBe('4s');
    expect(formatDuration(185_000)).toBe('3m 5s');
    expect(formatDuration(3_720_000)).toBe('1h 2m');
  });

  it('names the run after the folder holding the config, or rootDir without one', async () => {
    const sent = stubFetch();
    const reporter = new BliprReporter({ topic: 'builds' });
    reporter.onBegin({ ...config, configFile: undefined }, fakeSuite(PASSING));
    await reporter.onEnd({ status: 'passed', duration: 60_000, startTime: new Date() });
    expect(sent[0]?.body.title).toBe('Tests passed: tests');
  });

  it('resets the error count between runs', async () => {
    const sent = stubFetch();
    const reporter = new BliprReporter({ topic: 'builds' });
    reporter.onBegin(config, fakeSuite([]));
    reporter.onError();
    reporter.onBegin(config, fakeSuite([]));
    await reporter.onEnd({ status: 'failed', duration: 60_000, startTime: new Date() });
    expect(sent[0]?.body.message).not.toContain('outside tests');
  });
});

describe('when to send', () => {
  it('does nothing without a topic', async () => {
    const sent = stubFetch();
    await run({}, PASSING);
    expect(sent).toHaveLength(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it('skips interrupted runs', async () => {
    const sent = stubFetch();
    await run({ topic: 'builds' }, PASSING, { status: 'interrupted' });
    expect(sent).toHaveLength(0);
  });

  it('skips runs shorter than minDuration (default 30s)', async () => {
    const sent = stubFetch();
    await run({ topic: 'builds' }, PASSING, { duration: 29_000 });
    await run({ topic: 'builds', minDuration: 5 }, PASSING, { duration: 4_000, status: 'failed' });
    expect(sent).toHaveLength(0);
    await run({ topic: 'builds', minDuration: 0 }, PASSING, { duration: 300 });
    expect(sent).toHaveLength(1);
  });

  it('with when=failures, sends failures only', async () => {
    const sent = stubFetch();
    await run({ topic: 'builds', when: 'failures' }, PASSING);
    expect(sent).toHaveLength(0);
    await run({ topic: 'builds', when: 'failures' }, MIXED, { status: 'failed' });
    await run({ topic: 'builds', when: 'failures' }, MIXED, { status: 'timedout' });
    expect(sent).toHaveLength(2);
  });

  it('does nothing before onBegin', async () => {
    const sent = stubFetch();
    await new BliprReporter({ topic: 'builds' }).onEnd({ status: 'passed', duration: 60_000, startTime: new Date() });
    expect(sent).toHaveLength(0);
  });

  it('leaves the console to other reporters', () => {
    expect(new BliprReporter().printsToStdio()).toBe(false);
  });
});

describe('options', () => {
  it('reads every option from env vars', async () => {
    vi.stubEnv('BLIPR_TOPIC', 'from-env');
    vi.stubEnv('BLIPR_SERVER', 'https://example.test/');
    vi.stubEnv('BLIPR_TOKEN', 'blipr_pk_env');
    vi.stubEnv('BLIPR_WHEN', 'failures');
    vi.stubEnv('BLIPR_MIN_DURATION', '1');
    vi.stubEnv('BLIPR_TIMEOUT', '1000');
    vi.stubEnv('BLIPR_TITLE', 'Nightly');
    vi.stubEnv('BLIPR_CLICK', 'https://example.test/run');
    const sent = stubFetch();
    await run({}, PASSING, { duration: 2_000 });
    expect(sent).toHaveLength(0);
    await run({}, MIXED, { duration: 2_000, status: 'failed' });
    expect(sent[0]?.url).toBe('https://example.test/blip/from-env');
    expect(sent[0]?.headers.Authorization).toBe('Bearer blipr_pk_env');
    expect(sent[0]?.body).toMatchObject({ title: 'Tests failed: Nightly', click: 'https://example.test/run' });
  });

  it('prefers reporter options over env vars', async () => {
    vi.stubEnv('BLIPR_TOPIC', 'from-env');
    vi.stubEnv('BLIPR_SERVER', 'https://env.test');
    vi.stubEnv('BLIPR_TOKEN', 'env-token');
    vi.stubEnv('BLIPR_WHEN', 'failures');
    vi.stubEnv('BLIPR_MIN_DURATION', '999');
    vi.stubEnv('BLIPR_TITLE', 'Env');
    vi.stubEnv('BLIPR_CLICK', 'https://env.test/click');
    const sent = stubFetch();
    await run(
      {
        topic: 'opt', server: 'https://opt.test', token: 'opt-token', when: 'always',
        minDuration: 0, title: 'Opt', click: 'https://opt.test/click',
      },
      PASSING,
    );
    expect(sent[0]?.url).toBe('https://opt.test/blip/opt');
    expect(sent[0]?.headers.Authorization).toBe('Bearer opt-token');
    expect(sent[0]?.body).toMatchObject({ title: 'Tests passed: Opt', click: 'https://opt.test/click' });
  });

  it('falls back to defaults for unparseable numbers', async () => {
    vi.stubEnv('BLIPR_MIN_DURATION', 'soon');
    const sent = stubFetch();
    await run({ topic: 'builds' }, PASSING, { duration: 29_000 });
    expect(sent).toHaveLength(0);
  });

  it('sends no token header without a token', async () => {
    const sent = stubFetch();
    await run({ topic: 'builds' }, PASSING);
    expect(sent[0]?.headers.Authorization).toBeUndefined();
    expect(sent[0]?.body.click).toBeUndefined();
  });

  it('prints instead of sending on a dry run, hiding the token', async () => {
    const sent = stubFetch();
    await run({ topic: 'builds', token: 'secret', dryRun: true }, PASSING);
    vi.stubEnv('BLIPR_DRY_RUN', 'true');
    await run({ topic: 'builds' }, PASSING);
    expect(sent).toHaveLength(0);
    expect(log).toHaveBeenCalledTimes(2);
    const printed = String(log.mock.calls[0]?.[0]);
    expect(printed).toContain('POST https://blipr.dev/blip/builds');
    expect(printed).toContain('Bearer ***');
    expect(printed).not.toContain('secret');
  });
});

describe('GitHub Actions', () => {
  it('links the blip to the workflow run', async () => {
    vi.stubEnv('GITHUB_SERVER_URL', 'https://github.com');
    vi.stubEnv('GITHUB_REPOSITORY', 'acme/web');
    vi.stubEnv('GITHUB_RUN_ID', '123');
    const sent = stubFetch();
    await run({ topic: 'builds' }, PASSING);
    expect(sent[0]?.body.click).toBe('https://github.com/acme/web/actions/runs/123');
  });

  it('keeps an explicit click', async () => {
    vi.stubEnv('GITHUB_SERVER_URL', 'https://github.com');
    vi.stubEnv('GITHUB_REPOSITORY', 'acme/web');
    vi.stubEnv('GITHUB_RUN_ID', '123');
    const sent = stubFetch();
    await run({ topic: 'builds', click: 'https://example.test' }, PASSING);
    expect(sent[0]?.body.click).toBe('https://example.test');
  });
});

describe('topics', () => {
  it('sends a protected @handle/topic to its namespaced URL', async () => {
    const sent = stubFetch();
    await run({ topic: '@Alice/deploys', token: 'blipr_pk_x' }, PASSING);
    await run({ topic: '%40alice/deploys' }, PASSING);
    expect(sent.map((s) => s.url)).toEqual([
      'https://blipr.dev/blip/@alice/deploys',
      'https://blipr.dev/blip/@alice/deploys',
    ]);
    expect(sent[0]?.headers.Authorization).toBe('Bearer blipr_pk_x');
  });

  it.each(['has space', 'a/b', 'x'.repeat(65), '@al/deploys', '@1alice/deploys', '@alice/a/b', '@alice/', 'a,b'])(
    'warns and sends nothing for invalid topic %j',
    async (topic) => {
      const sent = stubFetch();
      await run({ topic }, PASSING);
      expect(sent).toHaveLength(0);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain('is not a valid topic');
    },
  );
});

describe('errors never escape', () => {
  it('warns once on an HTTP error', async () => {
    stubFetch(() => Promise.resolve(new Response('{"error":"nope"}', { status: 403 })));
    await expect(run({ topic: 'builds' }, PASSING)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toBe('blipr: could not send the run summary (HTTP 403) {"error":"nope"}');
  });

  it('warns once when the server is unreachable', async () => {
    stubFetch(() => Promise.reject(new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } })));
    await run({ topic: 'builds' }, PASSING);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toBe(
      'blipr: could not send the run summary to https://blipr.dev (ECONNREFUSED)',
    );
  });

  it('falls back to the cause message, then the error message', async () => {
    stubFetch(() => Promise.reject(new TypeError('fetch failed', { cause: new Error('bad port') })));
    await run({ topic: 'builds' }, PASSING);
    stubFetch(() => Promise.reject(new Error('offline')));
    await run({ topic: 'builds' }, PASSING);
    expect(warn.mock.calls.map((c) => String(c[0]))).toEqual([
      'blipr: could not send the run summary to https://blipr.dev (bad port)',
      'blipr: could not send the run summary to https://blipr.dev (offline)',
    ]);
  });

  it('gives up after the timeout', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_, reject) => {
      init.signal?.addEventListener('abort', () => { reject(init.signal?.reason as Error); });
    })));
    const started = Date.now();
    await run({ topic: 'builds', timeout: 50 }, PASSING);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(String(warn.mock.calls[0]?.[0])).toContain('(no answer within 50ms)');
  });

  it('swallows anything else that throws', async () => {
    vi.stubGlobal('fetch', () => { throw new Error('boom'); });
    const reporter = new BliprReporter({ topic: 'builds' });
    reporter.onBegin(config, { allTests: () => { throw new Error('suite exploded'); } } as never);
    await expect(reporter.onEnd({ status: 'passed', duration: 60_000, startTime: new Date() })).resolves.toBeUndefined();
    expect(String(warn.mock.calls[0]?.[0])).toBe('blipr: could not send the run summary (suite exploded)');
    await run({ topic: 'builds' }, PASSING);
    expect(String(warn.mock.calls[1]?.[0])).toContain('(boom)');
  });

  it('never changes the run status', async () => {
    stubFetch();
    const reporter = new BliprReporter({ topic: 'builds' });
    reporter.onBegin(config, fakeSuite(MIXED));
    await expect(reporter.onEnd({ status: 'failed', duration: 60_000, startTime: new Date() })).resolves.toBeUndefined();
  });
});
