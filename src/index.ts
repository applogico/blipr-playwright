import path from 'node:path';
import type { FullConfig, FullResult, Reporter, Suite } from '@playwright/test/reporter';
import { buildBlip } from './format';
import { resolveOptions, type BliprReporterOptions, type ResolvedOptions } from './options';
import { send } from './send';
import { topicPath } from './topic';

export type { BliprReporterOptions, When } from './options';

/** Playwright reporter that sends one Blipr blip when a test run finishes. */
export default class BliprReporter implements Reporter {
  private readonly options: ResolvedOptions;
  private config?: FullConfig;
  private suite?: Suite;
  private errors = 0;

  constructor(options: BliprReporterOptions = {}) {
    this.options = resolveOptions(options, process.env);
  }

  printsToStdio(): boolean {
    return false;
  }

  onBegin(config: FullConfig, suite: Suite): void {
    this.config = config;
    this.suite = suite;
    this.errors = 0;
  }

  onError(): void {
    this.errors++;
  }

  async onEnd(result: FullResult): Promise<void> {
    try {
      await this.report(result);
    } catch (e) {
      console.warn(`blipr: could not send the run summary (${e instanceof Error ? e.message : String(e)})`);
    }
  }

  private async report(result: FullResult): Promise<void> {
    const o = this.options;
    if (!o.topic || !this.suite || !this.wanted(result)) return;
    const topic = topicPath(o.topic);
    if (!topic) {
      console.warn(`blipr: "${o.topic}" is not a valid topic, so no run summary was sent`);
      return;
    }
    const blip = buildBlip(this.suite.allTests(), result, this.errors, o.title ?? this.projectName());
    await send(blip, { ...o, url: `${o.server}/blip/${topic}` });
  }

  private wanted(result: FullResult): boolean {
    const o = this.options;
    // The person stopped the run, so they are already watching.
    if (result.status === 'interrupted') return false;
    if (result.duration < o.minDuration * 1000) return false;
    return !(o.when === 'failures' && result.status === 'passed');
  }

  private projectName(): string {
    const c = this.config;
    const dir = c?.configFile ? path.dirname(c.configFile) : (c?.rootDir ?? process.cwd());
    return path.basename(dir);
  }
}
