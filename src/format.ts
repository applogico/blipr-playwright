import type { FullResult, TestCase } from '@playwright/test/reporter';

const MAX_FAILED_TITLES = 3;

export interface Blip {
  title: string;
  message: string;
  priority: number;
  tags: string[];
}

interface Tally {
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  failedTitles: string[];
}

/** Human duration: `42s`, `3m 5s`, `1h 2m`. */
export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** `[project] describe › test`, leaving out the root and file suites. */
export function testLabel(test: TestCase): string {
  const [, project, , ...rest] = test.titlePath();
  const name = rest.filter(Boolean).join(' › ') || test.title;
  return project ? `[${project}] ${name}` : name;
}

function tally(tests: TestCase[]): Tally {
  const t: Tally = { passed: 0, failed: 0, skipped: 0, flaky: 0, failedTitles: [] };
  for (const test of tests) {
    const outcome = test.outcome();
    if (outcome === 'expected') t.passed++;
    else if (outcome === 'skipped') t.skipped++;
    else if (outcome === 'flaky') t.flaky++;
    else {
      t.failed++;
      t.failedTitles.push(testLabel(test));
    }
  }
  return t;
}

function headline(status: FullResult['status'], name: string): string {
  if (status === 'passed') return `Tests passed: ${name}`;
  if (status === 'timedout') return `Tests timed out: ${name}`;
  return `Tests failed: ${name}`;
}

function body(t: Tally, duration: number, errors: number): string {
  const counts = `${t.passed} passed, ${t.failed} failed, ${t.skipped} skipped, ${t.flaky} flaky`;
  const lines = [`${counts} in ${formatDuration(duration)}`];
  if (errors) lines.push(`${errors} error${errors === 1 ? '' : 's'} outside tests`);
  if (t.failedTitles.length) {
    lines.push('');
    for (const title of t.failedTitles.slice(0, MAX_FAILED_TITLES)) lines.push(`✗ ${title}`);
    const more = t.failedTitles.length - MAX_FAILED_TITLES;
    if (more > 0) lines.push(`and ${more} more`);
  }
  return lines.join('\n');
}

/** The blip for a finished run. */
export function buildBlip(
  tests: TestCase[],
  result: Pick<FullResult, 'status' | 'duration'>,
  errors: number,
  name: string,
): Blip {
  const passed = result.status === 'passed';
  return {
    title: headline(result.status, name),
    message: body(tally(tests), result.duration, errors),
    priority: passed ? 3 : 4,
    tags: [passed ? 'white_check_mark' : 'x'],
  };
}
