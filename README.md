# AdviseSlot
CPE 334 group project: students book office-hour advising slots with advisors (Theme 1).

Design documents are in `docs/` (SRS, System SDS, decisions, features, traceability).

## Project layout

```
client/              React 18 + TypeScript + Vite + Bootstrap 5
server/              Express 4 + TypeScript + Prisma 5 + Vitest/Supertest
docker-compose.yml   Local PostgreSQL 17 for development
```

## Requirements

- Node.js 24 (the version CI and the Docker image use; `.nvmrc` says 24)
- Docker Desktop (for the local database)

## Setup

1. Start the database. It listens on host port **5433** so it does not clash with a
   locally installed PostgreSQL.

   ```bash
   docker compose up -d db
   ```

2. Set up the server.

   ```bash
   cd server
   cp .env.example .env
   cp .env.test.example .env.test
   npm install
   npx prisma migrate dev
   npx prisma db seed
   ```

   The seed is safe to run again. It creates these synthetic demo accounts. They all get
   the password from `SEED_DEMO_PASSWORD` (12+ characters, set in `server/.env`; the
   example file has a local-only placeholder). The password is not in the code. An account
   that already exists keeps its old password. Never use the demo password anywhere else:

   | Email | Role |
   |---|---|
   | `advisor1@example.test` | Advisor |
   | `advisor2@example.test` | Advisor |
   | `student1@example.test` | Student |
   | `student2@example.test` | Student |
   | `student3@example.test` | Student |

   It also adds demo slots for the next three weekdays and books one of them each for
   `student2` and `student3` (a student holds one upcoming booking, BR-07). `student1` has
   none, so you can book as `student1` at http://localhost:5173/slots.

3. Set up the client.

   ```bash
   cd client
   cp .env.example .env
   npm install
   ```

## Run

In two terminals:

```bash
cd server && npm run dev     # API on http://localhost:3000
cd client && npm run dev     # UI on http://localhost:5173
```

The page at http://localhost:5173 shows "API ok, database up" when everything is connected.

## Test

The database container must be running.

```bash
cd server && npm test
```

Tests use a separate database, `adviseslot_test`, set in `server/.env.test`, so they
never touch your development data. Before the tests run, `prisma migrate deploy`
creates that database if needed and applies all migrations. The tests refuse to run
if the database name does not end in `_test`.

## End-to-end test (Playwright)

The database container must be running and `server/.env.test` must exist (see Setup).

```bash
cd e2e
npm install
npx playwright install chromium    # first time only
npm test
```

Playwright starts the API (port 3100) and the Vite client (port 5273) itself, so you do
not need `npm run dev`. It uses the test database `adviseslot_test` from `server/.env.test`
(never your development data), refuses to run if the name does not end in `_test`, applies
the migrations and seeds the demo accounts first. The journey logs in as `student1`, checks
the identity in the top bar, logs out and checks that a protected page and `/api/auth/me`
are refused, and tries a wrong password. It also books the first slot on `/slots` as
`student1` and checks that a second booking shows the server's message (F-06, F-07). In the
full journey `advisor1` creates a slot, `student2` books it and opens it from "My bookings",
`advisor1` opens it from the schedule and sees the student's name, and `advisor2` gets
"Booking not found." (F-04 to F-09). A student opening `/schedule` gets the 403 message.
Before each run it empties the `Slot` and `Booking` tables of the test database and re-seeds
the slots, so it can run again. The HTML report is written to
`e2e/playwright-report/` (gitignored).

## Production build (one container)

In production Express serves the built client, so the page and the API share one origin
(the session cookie needs this). `NODE_ENV=production` turns it on.

```bash
cd client && npm ci && npm run build      # writes client/dist
cd ../server && npm ci && npm run build   # writes server/dist
NODE_ENV=production DATABASE_URL=... node dist/index.js
```

`CLIENT_DIST` overrides where the client build is read from (default `../client/dist`
relative to `server/dist`). Sessions are stored in PostgreSQL (`Session` table), so any
number of instances can serve the same user. `GET /api/health` is a liveness check and
`GET /api/ready` returns 200 only when the database answers (503 otherwise).

Apply migrations and seed a deployed database with `npx prisma migrate deploy` and
`SEED_DEMO_PASSWORD=... npx prisma db seed` (see `docs/labs/lab-05/deployment.md`).

## Stop the database

```bash
docker compose down        # keeps the data
docker compose down -v     # also deletes the data
```

## Configuration

All configuration comes from environment variables (SDS section 8). Only the
`.env.example` files are committed; real `.env` files are gitignored.
