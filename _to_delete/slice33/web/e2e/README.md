# End-to-end tests

These run against a **real stack** — Rails on `:3001`, Vite on `:5173`, Sidekiq and
Redis up, and `rails demo:seed` already applied. Every assertion maps to an
acceptance criterion from the report, and every run is recorded on video.

That pairing is the point. The case study asks for a walkthrough of the real
flow; a recording of assertions that *passed* is stronger evidence than a screen
capture of somebody clicking around, and it costs nothing extra to produce.

---

## One-time setup

```bash
cd web
npm install
npx playwright install chromium
```

## Every run

Four processes, then the test.

```bash
# 1 — infrastructure
docker start redis                       # or: brew services start redis

# 2 — backend (from api/)
bundle exec sidekiq -r ./config/environment.rb -C config/sidekiq.yml   # tab 1
bundle exec rails server -p 3001                                       # tab 2

# 3 — frontend (from web/)
npm run dev                                                            # tab 3

# 4 — seed, if you have not already
cd api && bundle exec rails db:migrate && bundle exec rails demo:seed
```

Mint a token and run:

```bash
cd api
export E2E_TOKEN=$(bundle exec rails runner \
  'puts JsonWebToken.encode({user_id: 1, role: "admin", scheme: "test-corp"})')

cd ../web
npm run test:e2e
```

## Watching it happen

```bash
npm run test:e2e:headed     # a visible browser, slowed down
npm run test:e2e:ui         # Playwright UI mode, step through and time-travel
```

## Where the recording lands

```
web/e2e/artifacts/<test-name>/video.webm
```

Playwright records `.webm`. For the submission video, convert and trim:

```bash
# whole run, as mp4
ffmpeg -i e2e/artifacts/*/video.webm -c:v libx264 -crf 20 -pix_fmt yuv420p walkthrough.mp4

# a 40-second excerpt starting at 0:12
ffmpeg -ss 12 -i walkthrough.mp4 -t 40 -c copy excerpt.mp4
```

`brew install ffmpeg` if you do not have it.

The HTML report — screenshots, network, the DOM at each step — is at
`e2e/report/index.html`, opened with `npx playwright show-report e2e/report`.

---

## What each test proves

| Test | Acceptance criteria |
|---|---|
| carries the bar, the provenance and the uncertainty | AC-1.1, AC-2.2, AC-3.1, AC-3.2, AC-3.3, AC-4.4, AC-7.1 — the four P0s asserted on a live page |
| marks the report stale after a late override | AC-6.5 |
| names the offending field on a contract break | AC-1.2 — the response is rewritten mid-flight to strip `required_level`, reproducing the exact P0-1 shape |
| surfaces an error and a way out on 500 | AC-6.1 |
| survives a 375px viewport | AC-7.3, AC-7.5 |

The contract-break test is worth understanding. It intercepts the fit/gap
response and deletes `required_level` from every row before the app sees it —
manufacturing, on demand, the precise defect that shipped. Without the boundary
schema the table would render with an invisible hole in it; with it, the page
refuses to render and names the missing field. That is the P0-1 regression guard,
proven at the level a user actually experiences.

---

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `E2E_TOKEN` | — | **Required.** JWT for the assessor. |
| `E2E_BASE_URL` | `http://localhost:5173` | Where the web app is served. |
| `E2E_ASSESSMENT` | `DEMO — Frontend Engineer` | Assessment the seed creates. |
| `E2E_VACANCY_ID` | `1` | Vacancy used by the error-path tests. |
| `E2E_SLOWMO` | `250` | Milliseconds between actions. Set `0` for CI, raise it for a more watchable recording. |

---

## If a test fails

The failure is almost always one of three things, in this order of likelihood:

1. **`demo:seed` has not been run**, or was run against a different database.
   The suite says so explicitly rather than failing on a missing element.
2. **`E2E_TOKEN` has expired.** Tokens last as long as
   `TOKEN_EXPIRATION_TIME`; mint a fresh one.
3. **Sidekiq is not running**, so the fit/gap report never generates and the
   table never appears. The 45-second timeout on that wait exists to make this
   distinguishable from a genuinely broken page.

A real failure leaves a trace: `npx playwright show-trace e2e/artifacts/<test>/trace.zip`
gives the DOM, the network and the console at every step.
