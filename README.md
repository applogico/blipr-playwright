# @blipr/playwright

[![npm version](https://img.shields.io/npm/v/@blipr/playwright)](https://www.npmjs.com/package/@blipr/playwright)
[![CI](https://github.com/applogico/blipr-playwright/actions/workflows/ci.yml/badge.svg)](https://github.com/applogico/blipr-playwright/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/npm/l/@blipr/playwright)](./LICENSE)

Know how your Playwright run went without watching it. This reporter sends one [Blipr](https://apps.apple.com/us/app/blipr-notifications/id6785094245) push to your iPhone when a run finishes: what passed, what failed, and a tap straight to the run.

- **One push per run**, from the terminal, CI, UI mode, watch mode or VS Code.
- **Failures stand out:** a failed or timed-out run arrives at a higher priority than a passing one, with the first failed tests listed.
- **Quiet when you're already watching:** short runs and runs you stop yourself send nothing.
- **Never breaks your run:** if Blipr can't be reached, you get one warning line and the same exit code.
- **Zero runtime dependencies.**

## Install

```sh
npm install -D @blipr/playwright
```

Requires Node 20 or later and `@playwright/test`.

On blipr.dev the topic has to exist first: subscribe to it in the Blipr app to create it.

## Quick start

Try it on any project without touching the config (Playwright 1.63 or later):

```sh
BLIPR_TOPIC=my-topic npx playwright test --add-reporter=@blipr/playwright
```

Or add it to `playwright.config.ts`, next to the reporter you already use:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    ['list'],
    ['@blipr/playwright', { topic: 'my-topic' }],
  ],
});
```

With no topic set, the reporter does nothing, so it's safe to commit and turn on per machine with `BLIPR_TOPIC`.

## What you get

```
Tests failed: my-app
12 passed, 2 failed, 1 skipped, 0 flaky in 3m 12s

✗ [chromium] checkout › applies a coupon
✗ [webkit] checkout › applies a coupon
```

A passing run arrives as "Tests passed: my-app" at priority 3. A failed run ("Tests failed") or one that hit the global timeout ("Tests timed out") arrives at priority 4. Up to 3 failed tests are listed, then "and N more". Errors outside tests, such as a broken global setup, are counted too.

## Options

Every option can be set in the reporter config or as an environment variable. The config wins when both are set.

| Option        | Env var              | Default             | Description                                                                  |
| ------------- | -------------------- | ------------------- | ---------------------------------------------------------------------------- |
| `topic`       | `BLIPR_TOPIC`        | none                | Topic to send to: `my-topic`, or a protected `@handle/topic`. Unset = off.   |
| `server`      | `BLIPR_SERVER`       | `https://blipr.dev` | Blipr server. Point it at your own host to self-host.                        |
| `token`       | `BLIPR_TOKEN`        | none                | Access token for a protected topic, sent as `Authorization: Bearer`.         |
| `when`        | `BLIPR_WHEN`         | `always`            | `always`, or `failures` to hear only about failed and timed-out runs.        |
| `minDuration` | `BLIPR_MIN_DURATION` | `30`                | Runs shorter than this many seconds send nothing. `0` sends every run.       |
| `timeout`     | `BLIPR_TIMEOUT`      | `5000`              | Milliseconds to wait for the server before giving up.                        |
| `title`       | `BLIPR_TITLE`        | project folder name | Name shown after "Tests passed:" and "Tests failed:".                        |
| `click`       | `BLIPR_CLICK`        | the CI run, if any  | URL opened when you tap the push. On GitHub Actions it defaults to the run.  |
| `dryRun`      | `BLIPR_DRY_RUN`      | `false`             | Print the request instead of sending it. The token is masked.                |

A run you stop yourself (Ctrl+C, or Stop in UI mode) never sends anything.

## UI mode, watch mode and VS Code

The reporter runs in UI mode (`--ui`), watch mode and the VS Code extension too. It sends once per Run click, not once per session.

`minDuration` keeps that pleasant: clicking Run on one quick test sends nothing, while a long run you started and walked away from still reaches you. Set `minDuration: 0` to hear about every run, or raise it if you only care about the long ones.

## CI

Store the topic (and a token, for a protected topic) as secrets and pass them as env vars:

```yaml
- run: npx playwright test
  env:
    BLIPR_TOPIC: ${{ secrets.BLIPR_TOPIC }}
    BLIPR_TOKEN: ${{ secrets.BLIPR_TOKEN }}
    BLIPR_MIN_DURATION: 0
```

On GitHub Actions the push opens the workflow run when you tap it, unless you set `click` yourself. CI runs are rarely short enough to matter, but `BLIPR_MIN_DURATION: 0` makes sure every one is reported. Add `BLIPR_WHEN: failures` to hear only when something breaks.

## Protected topics

A public topic's name is its password, so keep it hard to guess. A protected topic can have a readable name, like `@yourhandle/tests`, because only holders of a token can send to it. Create the topic and a `write` token in the Blipr app, then:

```ts
['@blipr/playwright', { topic: '@yourhandle/tests', token: process.env.BLIPR_TOKEN }]
```

Keep the token out of your repo: read it from an env var or a CI secret.

## Errors

The reporter never throws and never changes your run's exit code. If the server can't be reached, answers with an error, or takes longer than `timeout`, you see one line such as:

```
blipr: could not send the run summary to https://blipr.dev (ECONNREFUSED)
```

## License

[MIT](./LICENSE)
