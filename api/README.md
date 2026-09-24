# Local Setup

## Prerequisites

- Ruby (see `.ruby-version`)
- Node.js + npm
- PostgreSQL (running locally or via Docker)
- Docker (for Redis)

---

## 1. Environment variables

```bash
cp config/application.yml.sample config/application.yml
```

Fill in the required values in `config/application.yml`:

| Variable | Description |
|---|---|
| `SECRET_KEY_BASE` | Must match `rakamin-api` — JWT tokens are shared |
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USERNAME` / `DB_PASSWORD` | Shared PostgreSQL instance |
| `GEMINI_API_KEY` | Google AI Studio API key |
| `GEMINI_LIVE_MODEL` | e.g. `gemini-3.1-flash-live-preview` |
| `GEMINI_ANALYSIS_MODEL` | e.g. `gemini-2.0-flash-001` |
| `GEMINI_PRO_MODEL` | e.g. `gemini-2.5-pro` |
| `REDIS_URL` | e.g. `redis://localhost:6379/1` |
| `ALLOWED_ORIGINS` | CORS origin for the frontend, e.g. `http://localhost:5173` |
| `APP_BASE_URL` | **Frontend** base URL, e.g. `http://localhost:5173`. Used to build candidate invite links (`/interview/:token`), which are served by the React app, not this API |

---

## 1b. Check the environment

```bash
bin/doctor
```

Reports Ruby version, filled-in config keys, PostgreSQL, Redis, free ports and
installed gems, and prints the command to fix whatever is missing. Run it first
whenever the server will not start.

---

## 2. Install dependencies

```bash
bundle install
```

---

## 3. Set up the database

```bash
rails db:create   # skip if DB already exists
rails db:migrate
rails db:seed     # organization + skill taxonomy (no users)
```

`db:seed` does not create any user. To get an account you can log in with:

```bash
rails demo:dashboard   # staff accounts + sample assessments and vacancies
```

All demo accounts use the password `password123`.

---

## 4. Start Redis

Homebrew (no Docker daemon needed):

```bash
brew install redis
brew services start redis
redis-cli ping   # expect: PONG
```

Or Docker, if a daemon is already running:

```bash
docker run -d -p 6379:6379 --name redis redis:alpine
```

---

## 5. Start Sidekiq

```bash
bundle exec sidekiq -r ./config/environment.rb -C config/sidekiq.yml
```

---

## 6. Start the Rails server

Redis is not required for the API in development — only Sidekiq needs it. Jobs
that cannot be queued are skipped with a warning instead of failing the request.


```bash
bundle exec rails server
```

Runs on **port 3001** by default.

---

## 7. Start the frontend

```bash
cd ../web
npm install
npm run dev
```

Runs on **port 5173** by default.

---

## Evaluating the model's judgement

```bash
bundle exec rails eval:report        # grounding, calibration, bias
bundle exec rails eval:ungrounded    # quotes that are not in the transcript
EVAL_FORMAT=json bundle exec rails eval:report > eval.json
```

Reads portfolio_skills, assessor_overrides, coverage_maps and transcript_turns.
No Gemini calls, so it costs nothing and runs offline. Self-consistency across
runs and name-invariance testing need the model and are not covered here.

---

## All services at a glance

| Service | Command | Port |
|---|---|---|
| Redis | `brew services start redis` | 6379 |
| Sidekiq | `bundle exec sidekiq -r ./config/environment.rb -C config/sidekiq.yml` | — |
| Rails API | `bundle exec rails server` | 3001 |
| Frontend | `npm run dev` (in `web/`) | 5173 |
