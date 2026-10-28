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

- Node.js 18 or newer
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
   ```

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

## Stop the database

```bash
docker compose down        # keeps the data
docker compose down -v     # also deletes the data
```

## Configuration

All configuration comes from environment variables (SDS section 8). Only the
`.env.example` files are committed; real `.env` files are gitignored.
