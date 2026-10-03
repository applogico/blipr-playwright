import type { Blip } from './format';

export interface Target {
  url: string;
  server: string;
  token?: string;
  click?: string;
  timeout: number;
  dryRun: boolean;
}

function describeError(e: unknown, timeout: number): string {
  if (e instanceof Error && e.name === 'TimeoutError') return `no answer within ${timeout}ms`;
  if (!(e instanceof Error)) return String(e);
  const cause = e.cause as { code?: unknown; message?: unknown } | undefined;
  if (typeof cause?.code === 'string') return cause.code;
  return typeof cause?.message === 'string' ? cause.message : e.message;
}

async function warnOnHttpError(res: Response): Promise<void> {
  if (res.ok) return;
  const text = (await res.text().catch(() => '')).slice(0, 200).trim();
  console.warn(`blipr: could not send the run summary (HTTP ${res.status})${text ? ` ${text}` : ''}`);
}

/** POST the blip as JSON. Never throws; prints one warning line on failure. */
export async function send(blip: Blip, target: Target): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (target.token) headers.Authorization = `Bearer ${target.token}`;
  const payload = JSON.stringify({ ...blip, ...(target.click ? { click: target.click } : {}) });
  if (target.dryRun) {
    const shown = target.token ? { ...headers, Authorization: 'Bearer ***' } : headers;
    console.log(`blipr (dry run): POST ${target.url}\n${JSON.stringify(shown)}\n${payload}`);
    return;
  }
  try {
    const res = await fetch(target.url, {
      method: 'POST',
      headers,
      body: payload,
      signal: AbortSignal.timeout(target.timeout),
    });
    await warnOnHttpError(res);
  } catch (e) {
    console.warn(`blipr: could not send the run summary to ${target.server} (${describeError(e, target.timeout)})`);
  }
}
