import type { FullConfig, FullResult, Suite, TestCase } from '@playwright/test/reporter';
import { vi } from 'vitest';
import BliprReporter, { type BliprReporterOptions } from '../src/index';

type Outcome = ReturnType<TestCase['outcome']>;

export function fakeTest(title: string, outcome: Outcome, project = '', describe: string[] = []): TestCase {
  return {
    title,
    outcome: () => outcome,
    titlePath: () => ['', project, 'tests/app.spec.ts', ...describe, title],
  } as unknown as TestCase;
}

export function fakeSuite(tests: TestCase[]): Suite {
  return { allTests: () => tests } as unknown as Suite;
}

export const config = { configFile: '/work/my-app/playwright.config.ts', rootDir: '/work/my-app/tests' } as FullConfig;

export interface Sent {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/** Stub global fetch; returns the captured requests. */
export function stubFetch(respond: () => Promise<Response> = () => Promise.resolve(new Response('{}'))): Sent[] {
  const sent: Sent[] = [];
  vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
    sent.push({
      url,
      headers: init.headers as Record<string, string>,
      body: JSON.parse(init.body as string) as Record<string, unknown>,
    });
    return respond();
  }));
  return sent;
}

export async function run(
  options: BliprReporterOptions,
  tests: TestCase[],
  result: Partial<FullResult> = {},
  errors = 0,
): Promise<void> {
  const reporter = new BliprReporter(options);
  reporter.onBegin(config, fakeSuite(tests));
  for (let i = 0; i < errors; i++) reporter.onError();
  const full = { status: 'passed', duration: 60_000, startTime: new Date(), ...result };
  await reporter.onEnd(full);
}
