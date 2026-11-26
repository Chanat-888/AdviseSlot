# AdviseSlot: System-Level Software Design Specification (SDS)

| Item | Value |
|---|---|
| Course | CPE 334, Semester 1/2026, Group Project |
| Owner of this document | Jeerasak Phisawong (reviewer: Chanat Dachkhumhang) |
| Related documents | `docs/srs.md`, `docs/decisions.md` |

## Version history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-10-28 | Chanat (drafted with an AI agent) | First draft for Jeerasak to review and take over. |
| 0.2 | 2026-10-28 | Jeerasak (with an AI agent) | Took ownership. Aligned with SRS v0.2: BR-02 and BR-16 in the domain module, `Slot.createdAt` and `Slot.isLate` for late slots, `Notification` entity, endpoints and screen for FR-19, new error codes. Fixed the exclusion constraint SQL (quoted identifiers, `timestamptz` columns). Merged duplicate role-matrix rows. Added open items. |
| 0.3 | 2026-10-28 | Jeerasak (with an AI agent) | Aligned with SRS v0.3. One status vocabulary for slots and bookings (D-24). Late slots starting 2 hours or less from now are rejected with 422 `SLOT_UNBOOKABLE` (D-23). History endpoint for FR-18. Closed O-01 and O-02. |
| 0.4 | 2026-10-28 | Jeerasak (with an AI agent) | Applied D-25: local PostgreSQL 17 in Docker on port 5433 (section 3.3), `DATABASE_URL` example matches the skeleton (section 8), app image built in Lab 5 (section 9). |
| 0.5 | 2026-11-04 | Chanat (drafted with an AI agent) | Section 7 (from the F-01 to F-03 contracts): the `sid` cookie gets `Max-Age=7200`; the login email is trimmed and lowercased (D-26); a 401 from `requireAuth` clears the cookie but does not delete the expired row (no session cleanup in Sprint 1). For the SDS owner to review. |
| 0.6 | 2026-11-04 | Chanat (drafted with an AI agent) | Review fix (PR #18): section 3.1 and 3.3 add the `User.email` lowercase CHECK constraint (D-26), written as raw SQL in the F-01 migration. For the SDS owner to review. |
| 0.7 | 2026-11-22 | Jeerasak (drafted with an AI agent) | Sprint 2 slot contracts (F-12, F-13, F-15). Closed O-03 (D-28). New 422 code `SLOT_ALREADY_STARTED` (D-29). Section 3.1: slot row lock so an edit or delete cannot race a booking (BR-14). Section 5.1: request shapes of the three slot endpoints. Section 5: 409 `BOOKING_NOT_ACTIVE` from the F-10/F-11/F-14 contracts (#76). Issue #68. |
| 0.8 | 2026-11-23 | Chanat (drafted with an AI agent) | Lab 7 change request #67, approved by TA Supachok Deetaweesukh on 2026-11-22 (D-31): section 3.1 BR-07 row now allows two active bookings, at most one per advisor (student row lock unchanged); section 5 adds 409 `SAME_ADVISOR_BOOKING`. For the SDS owner to review. |
| 0.9 | 2026-11-23 | Chanat (drafted with an AI agent) | F-18 contract v0.2: `GET /api/bookings/history` is advisor-only; students already see their cancelled bookings through `/mine` (F-10). |
| 0.10 | 2026-11-23 | Chanat (drafted with an AI agent) | Section 3.1 FR-19 row: lock note on the notification inserts (key-share lock on the student's `User` row, no cycle), from the review of PR #93. |
| 0.11 | 2026-11-23 | Jeerasak (drafted with an AI agent) | F-16 contract v0.1: section 5.1 `GET /api/slots/bookable` takes the optional `advisorId` and `date` filters, and `GET /api/advisors` returns `{ id, name }` only; section 4.1 `/slots` filter bar; section 6 adds the "List advisors" row. |
| 0.12 | 2026-11-23 | Jeerasak (drafted with an AI agent) | F-17 contract v0.1: section 5.1 `GET /api/summary` takes the Bangkok days `from` and `to` (at most 90 days) and returns `counts { slots, booked, cancelled, open }` and the upcoming appointments of the caller's slots. |
| 1.0 | 2026-11-26 | Chanat (drafted with an AI agent) | Final version for the `v1.0.0` release, checked against the code on `sprint-3` `d12ecfd` (F-17 #115, F-18 #113, F-19 #117 merged). Section 2: the services as built. Section 3.3: migrations as built, including `add_notification` (F-19); the demo password comes from `SEED_DEMO_PASSWORD`. Section 4.1: the Sprint 3 screens and top-bar links as built. Section 5: 503 `DB_UNAVAILABLE`. Section 5.1: the health (project skeleton), readiness and version (Lab 5) endpoints, and the F-19 response details. Section 8: `SEED_DEMO_PASSWORD`, `CLIENT_DIST`, `APP_COMMIT`. Section 9: the deploy runs on every push to `main` with no manual approval step. Section 10: `sprint-N` branches. For the SDS owner to review. |

## 1. Stack and rationale

| Layer | Technology | Why |
|---|---|---|
| UI | React 18, TypeScript, Vite, Bootstrap 5, React Router | Both students used this stack in Labs 1-4 (TokTickIT). |
| API / application | Node.js 18+, Express 4, TypeScript | Same as Labs 1-4. Simple REST layer, easy to test with Supertest. |
| Data access | Prisma 5 (schema, migrations, client) | Versioned migrations and a reproducible seed. Raw SQL migrations for constraints Prisma cannot express. |
| Database | PostgreSQL 17 | Transactions, row locks, partial unique indexes and exclusion constraints protect the booking rules. Available as Cloud SQL on GCP. |
| Tests | Vitest + Supertest (server), Vitest + Testing Library (client), Playwright (E2E) | Same tools as Labs 1-4. |

The product is a modular monolith: one Express server and one React client. In
production the Express server also serves the built client, so it ships as one
Docker image.

## 2. Architecture

```mermaid
flowchart LR
  B[Browser<br/>React SPA] -- "HTTPS JSON<br/>cookie sid" --> A[Express API]
  A --> M[Auth middleware<br/>requireAuth / requireRole]
  M --> R[Route handlers<br/>validation]
  R --> D[Domain module<br/>rules.ts: pure rule functions]
  R --> S[Services<br/>bookings, slots,<br/>notifications, summary]
  S --> P[(PostgreSQL<br/>via Prisma)]
```

| Component | Responsibility |
|---|---|
| React client | Screens, navigation, form input, display of server errors. It hides controls the user cannot use, but this is only convenience, never security. |
| Auth middleware | Reads the `sid` cookie, loads the session and user, rejects with 401 or 403. Every protected route uses it. |
| Route handlers | Parse and validate the request body and parameters, call a service, map results and domain errors to HTTP responses. |
| Domain module (`server/src/domain/rules.ts`) | Pure functions for BR-01 to BR-07, BR-11, BR-12 and BR-16 (slot validity including weekday and :00/:30 start, overlap, normal and late-slot deadline, cancel windows). They take "now" as a parameter and have no database access, so they are unit tested directly. |
| Services | Run each use case inside a database transaction: check ownership, call the rule functions, write rows. |
| PostgreSQL | Durable storage. Constraints are the last line of defence for BR-04, BR-05 and BR-07 under concurrency. |

**Where business rules are enforced:** on the server, in the domain module and the
services, backed by database constraints. The client repeats simple checks (for
example a valid start time) only to give faster feedback.

## 3. Data model

```mermaid
erDiagram
  User ||--o{ Session : has
  User ||--o{ Slot : "advises (ADVISOR)"
  User ||--o{ Booking : "books (STUDENT)"
  Slot ||--o{ Booking : "has (max 1 ACTIVE)"
  User ||--o{ Notification : "receives (STUDENT)"
  Slot ||--o{ Notification : "announced by"
  User {
    int id PK
    string name
    string email UK
    string passwordHash
    Role role "STUDENT | ADVISOR"
    datetime createdAt
  }
  Session {
    int id PK
    int userId FK
    string tokenHash UK
    datetime expiresAt
  }
  Slot {
    int id PK
    int advisorId FK
    datetime startAt
    datetime endAt
    datetime createdAt
    boolean isLate "set at creation (BR-16)"
    datetime deletedAt "null unless deleted (Sprint 2)"
  }
  Booking {
    int id PK
    int slotId FK
    int studentId FK
    BookingStatus status "ACTIVE | CANCELLED"
    datetime createdAt
    datetime cancelledAt
    int cancelledById FK
    string cancelReason
  }
  Notification {
    int id PK
    int studentId FK
    int slotId FK
    string message
    datetime createdAt
    datetime readAt "null until read"
  }
```

All `DateTime` columns are declared `@db.Timestamptz(3)` in the Prisma schema, so
they store an absolute UTC instant. Prisma's default (`timestamp(3)` without time
zone) would make the exclusion constraint below fail, because casting it to
`timestamptz` is not an immutable expression.

### 3.1 Constraints

| Constraint | Protects | How |
|---|---|---|
| `User.email` unique | Login identity | Prisma `@unique` |
| `User.email` lowercase | Login identity (D-26) | `CHECK ("email" = lower("email"))` in a raw SQL migration (added by F-01). With the unique constraint, two users cannot differ only by case. |
| `Session.tokenHash` unique | Session lookup | Prisma `@unique` |
| `Slot.endAt = startAt + 30 min` | BR-01 | Computed by the service. `CHECK ("endAt" = "startAt" + interval '30 minutes')` in a raw SQL migration. |
| No overlapping slots per advisor | BR-04 | Service check in a transaction, plus an exclusion constraint `EXCLUDE USING gist ("advisorId" WITH =, tstzrange("startAt", "endAt") WITH &&) WHERE ("deletedAt" IS NULL)` (needs `CREATE EXTENSION IF NOT EXISTS btree_gist`). Identifiers are quoted because Prisma creates camelCase column names. |
| One ACTIVE booking per slot | BR-05 | Partial unique index `CREATE UNIQUE INDEX ON "Booking"("slotId") WHERE status = 'ACTIVE'`. A second concurrent insert fails, and the service returns 409 `SLOT_TAKEN`. |
| At most two active bookings per student, at most one with the same advisor | BR-07 | Depends on the current time, so a static index cannot express it. The booking transaction first locks the student's `User` row (`SELECT ... FOR UPDATE`), then reads the student's active bookings: one with the slot's advisor gives 409 `SAME_ADVISOR_BOOKING`, otherwise two or more give 409 `ACTIVE_BOOKING_LIMIT` (D-31). The lock is unchanged: two parallel requests by one student run one after the other, so neither limit can be passed by a race. |
| Late slot flag | BR-06, BR-16 | When a slot is created, the service compares the server's "now" with the slot's normal BR-06 deadline and stores `isLate`. A late slot that starts 2 hours or less from now is rejected with 422 `SLOT_UNBOOKABLE` (D-23), so no notification is sent for it. The booking deadline is then the normal BR-06 deadline if `isLate` is false, and start - 2 hours if it is true. The flag is stored so the deadline does not change later. |
| Booked slot cannot be edited or deleted | BR-14 | Edit (F-12), delete (F-13) and booking (F-07, and the new slot of F-14) each lock the slot row (`SELECT ... FROM "Slot" WHERE id = $1 FOR UPDATE`) inside their transaction before their checks. Booking and reschedule lock the student's `User` row first and the slot row second; edit and delete lock only the slot row, so no deadlock cycle is possible. An edit or delete and a parallel booking of the same slot run one after the other, so a deleted or moved slot never ends up with a booking made against its old state. |
| One notification per student per late slot | FR-19 | Unique index on `Notification("studentId", "slotId")`. The late slot and one `Notification` row per student are inserted in the same transaction. Each insert takes a key-share lock on the student's `User` row (foreign key), so a late-slot create waits for any student's booking, cancel or reschedule that holds `FOR UPDATE` on that row. Those transactions never lock a slot the create is inserting, so there is no lock cycle and no deadlock (review of PR #93). |
| Foreign keys | Ownership links | `Slot.advisorId`, `Booking.slotId`, `Booking.studentId`, `Booking.cancelledById`, `Notification.studentId`, `Notification.slotId` reference their parents. Deletes are restricted. |

### 3.2 Ownership

- A slot belongs to `Slot.advisorId`.
- A booking belongs to its student (`Booking.studentId`) and is visible to the
  advisor who owns the slot (`Booking.slot.advisorId`).
- A notification belongs to its student (`Notification.studentId`).

### 3.3 Database setup, migrations and seed

- Local development (D-25): `docker compose up -d db` starts PostgreSQL 17 from `docker-compose.yml` at the repo root, on host port 5433 (so it does not clash with a locally installed PostgreSQL on 5432), with a named volume for data. The server and client run on the host with `npm run dev`.
- `npx prisma migrate dev` applies all migrations locally. `npx prisma migrate deploy` applies them in Docker and on GCP.
- Migrations in order: `init`, `add_session` (F-01), `add_slot` (F-04), `add_booking` (F-07), `add_booking_cancel` (F-10, F-11: the cancel columns and their CHECK constraints), `add_notification` (F-19: the `Notification` table, its unique index and foreign keys; new table only, no backfill). F-16, F-17 and F-18 need no migration.
- Raw SQL migrations add the `btree_gist` extension, the CHECK constraints (`Slot` duration, `User.email` lowercase), the exclusion constraint and the partial unique index.
- `npx prisma db seed` runs `server/prisma/seed.ts`. It is idempotent and creates synthetic data: 2 advisors, 3 students and a set of future slots, some already booked. The demo password is read from `SEED_DEMO_PASSWORD` (the seed refuses to run without it); locally it is set in `server/.env`, on GCP it is a Secret Manager secret. It is not in Git or in the PDF.

## 4. UI structure and conventions

### 4.1 Screens and navigation

| Route | Role | Screen | Sprint |
|---|---|---|---|
| `/login` | Anyone | Email and password form | 1 |
| `/slots` | Student | Bookable slots grouped by date, with advisor, time, deadline and a Book button. Sprint 3: Advisor and Date filters, kept in the page URL (`?advisor=&date=`, F-16) | 1 (filters in 3) |
| `/bookings` | Student | My bookings: Upcoming, Passed, Cancelled. A Cancelled row shows "Cancelled by you" (F-18) or "Cancelled by <advisor>: <reason>" (F-11) | 1 (labels in 2 and 3) |
| `/bookings/:id` | Student, Advisor | Booking detail | 1 |
| `/schedule` | Advisor | My schedule: create-slot form (weekday date, start time from 08:00 to 17:30 in 30-minute steps) and list of own slots with status (Open, Booked, Closed, Passed) and student name | 1 |
| `/history` | Advisor | Cancelled and passed bookings on own slots (deleted slots included), newest first, with the student, status, who cancelled and the reason, and a link to the booking detail (F-18) | 3 |
| `/summary` | Advisor | Appointment summary for a range of Bangkok days kept in the page URL (`?from=&to=`, default today to today + 6): Slots, Booked, Cancelled, Open and the upcoming appointments (F-17) | 3 |
| `/notifications` | Student | Late-slot notifications, newest first, with the slot's current advisor, date and time, a Book link while the slot can still be booked (otherwise "This slot is no longer available."), and a Mark as read button on unread rows (F-19) | 3 |

The top bar shows the user's name and role, the links of the user's role and a Logout
button. Students get Slots, My bookings and Notifications (with a badge for the number of
unread notifications, Sprint 3). Advisors get Schedule, History and Summary (Sprint 3). After login the
client calls `GET /api/auth/me` and sends students to `/slots` and advisors to
`/schedule`. A route guard redirects unauthenticated users to `/login`.

### 4.2 Shared UI behaviour

- **Loading:** a spinner while a request runs. Submit buttons are disabled during submission to stop double clicks.
- **Empty:** a short message, for example "No bookable slots right now."
- **Error:** a Bootstrap alert showing the server's `message`. A 401 response sends the user to `/login`.
- **Validation:** required fields are checked in the form, but the server's response is authoritative.
- **Time:** all times are shown in Asia/Bangkok local time, format `Wed 4 Nov 2026, 14:00-14:30`.
- **Statuses (D-24):** the server computes display statuses from stored data and the current time, and the client shows them as received. They are not stored columns.

| Shown status | Applies to | Condition |
|---|---|---|
| Open | Slot | Future, no active booking, before its booking deadline (BR-06, or BR-16 if late) |
| Booked | Slot | Has an active booking, slot not ended |
| Closed | Slot | Future, no active booking, booking deadline passed |
| Passed | Slot | `endAt` is in the past |
| Upcoming | Booking | `status = ACTIVE`, slot not ended |
| Passed | Booking | `status = ACTIVE`, slot ended |
| Cancelled | Booking | `status = CANCELLED` |

## 5. API conventions

- Base path `/api`. JSON request and response bodies. Times are ISO 8601 strings in UTC (`2026-11-04T07:00:00.000Z`).
- Authentication is by the `sid` cookie. The client sends requests with `credentials: "include"`.
- Errors always use this shape:

```json
{ "error": { "code": "BOOKING_DEADLINE_PASSED", "message": "Booking for this slot closed at 18:00 on 3 Nov." } }
```

| Status | Meaning | Example codes |
|---|---|---|
| 400 | Malformed or invalid input | `VALIDATION_ERROR` |
| 401 | No valid session, or wrong login | `UNAUTHENTICATED`, `INVALID_CREDENTIALS` |
| 403 | Logged in, but the role may not do this | `FORBIDDEN_ROLE` |
| 404 | Not found, or belongs to someone else (do not reveal it exists) | `NOT_FOUND` |
| 409 | Conflict with existing data | `SLOT_TAKEN`, `SLOT_OVERLAP`, `ACTIVE_BOOKING_LIMIT`, `SAME_ADVISOR_BOOKING` (Lab 7, #67, D-31), `SLOT_HAS_ACTIVE_BOOKING` (Sprint 2), `BOOKING_NOT_ACTIVE` (Sprint 2, F-10, F-11, F-14) |
| 422 | Valid input that breaks a business rule | `SLOT_OUTSIDE_HOURS`, `SLOT_NOT_WEEKDAY`, `SLOT_INVALID_START_MINUTE`, `SLOT_IN_PAST`, `SLOT_UNBOOKABLE`, `BOOKING_DEADLINE_PASSED`, `CANCEL_WINDOW_PASSED` (Sprint 2), `SLOT_ALREADY_STARTED` (Sprint 2, D-29) |
| 500 | Unexpected error. Generic message only; details go to the server log. | `INTERNAL_ERROR` |
| 503 | The database does not answer (`GET /api/health` only) | `DB_UNAVAILABLE` |

### 5.1 Endpoint overview

Detailed request and response shapes belong in each feature contract.

| Method and path | Role | Purpose | Sprint |
|---|---|---|---|
| `GET /api/health` | Anyone | Smoke check: 200 `{ status, db }`, or 503 `DB_UNAVAILABLE` (project skeleton) | 1 |
| `GET /api/ready` | Anyone | Readiness for Cloud Run and CI: 200 only when the database answers, else 503 (Lab 5) | 2 |
| `GET /api/version` | Anyone | The commit the server runs, `{ commit }` from `APP_COMMIT` (Lab 5) | 2 |
| `POST /api/auth/login` | Anyone | Log in | 1 |
| `POST /api/auth/logout` | Any logged-in | Log out | 1 |
| `GET /api/auth/me` | Any logged-in | Current user | 1 |
| `POST /api/slots` | Advisor | Create a slot (`{ startAt }`) | 1 |
| `GET /api/slots/mine` | Advisor | Own slots with booking status | 1 |
| `GET /api/slots/bookable` | Student | Bookable slots of all advisors. Sprint 3: optional `?advisorId=&date=` filters (`date` is a Bangkok `YYYY-MM-DD` day), which only narrow the list (F-16) | 1, 3 |
| `POST /api/bookings` | Student | Book a slot (`{ slotId }`) | 1 |
| `GET /api/bookings/mine` | Student | Own bookings | 1 |
| `GET /api/bookings/:id` | Student owner, slot's advisor | Booking detail | 1 |
| `POST /api/bookings/:id/cancel` | Student owner, slot's advisor | Cancel (advisor sends `{ reason }`) | 2 |
| `POST /api/bookings/:id/reschedule` | Student owner | Move to another slot (`{ newSlotId }`) | 2 |
| `PATCH /api/slots/:id` | Advisor owner | Change start time (`{ startAt }`, F-12) | 2 |
| `DELETE /api/slots/:id` | Advisor owner | Soft-delete an unbooked future slot (F-13) | 2 |
| `POST /api/slots/batch` | Advisor | Create consecutive slots (`{ startAt, endAt }`, all-or-nothing, F-15) | 2 |
| `GET /api/advisors` | Student | Advisor list for filtering: `{ id, name }` of every advisor, sorted by name (F-16) | 3 |
| `GET /api/summary?from=&to=` | Advisor | Appointment summary of own slots starting in the Bangkok days `from` to `to` (both included, at most 90 days): `counts { slots, booked, cancelled, open }` and the upcoming appointments (F-17) | 3 |
| `GET /api/bookings/history` | Advisor | Cancelled and passed bookings on own slots, with who cancelled and the reason (FR-18). Students see their cancelled bookings through `GET /api/bookings/mine` (F-10). | 3 |
| `GET /api/notifications` | Student | Own notifications, newest first: `{ unreadCount, items }`, each item with the slot's current data and `slotAvailable` (F-19, D-32) | 3 |
| `POST /api/notifications/:id/read` | Student owner | Mark one notification as read. Idempotent: a second call keeps the first `readAt` (F-19) | 3 |

## 6. Roles and permissions

| Operation | Student | Advisor | Record scope |
|---|---|---|---|
| Log in, log out, view own identity | Yes | Yes | Own session only |
| View bookable slots | Yes | No (403) | All advisors' open future slots, without booker identity |
| List advisors (Sprint 3) | Yes | No (403) | Every advisor's `id` and `name` only, no email (F-16) |
| Book a slot | Yes | No (403) | Self only. The student id comes from the session, never from the request. |
| List own bookings | Yes | No (403) | Only bookings where `studentId` = current user |
| View booking detail | Yes | Yes | Student: only bookings where `studentId` = current user. Advisor: only bookings on own slots. Otherwise 404. |
| Create, edit, delete slot | No (403) | Yes | Only slots where `advisorId` = current user, otherwise 404 |
| View own slots with student names | No (403) | Yes | Only own slots |
| Cancel booking (Sprint 2) | Own, BR-11 | Own slots, BR-12 | As above |
| Reschedule (Sprint 2) | Own | No (403) | As above |
| Appointment summary (Sprint 3) | No (403) | Yes | Only own slots |
| Booking history (Sprint 3) | No (403; own cancelled bookings via `/mine`) | Own slots | Advisor: bookings on own slots. |
| List and mark notifications (Sprint 3) | Yes | No (403) | Only notifications where `studentId` = current user, otherwise 404 |

The backend checks every row in this table. Hiding a button in the UI does not count as authorization.

## 7. Authentication and sessions

- **Passwords:** hashed with bcrypt, cost 12. Plaintext is never stored or logged.
- **Login:** `POST /api/auth/login` with `{ email, password }`. The email is trimmed and lowercased before the lookup (D-26). An unknown email and a wrong password return the same 401 `INVALID_CREDENTIALS`, with similar timing (a dummy bcrypt compare runs for unknown emails).
- **Session creation:** the server generates a random 32-byte token, stores only its SHA-256 hash in `Session` with `expiresAt` = now + 2 hours, and sets a cookie `sid` with `Max-Age=7200` (2 hours, equal to the session lifetime), `HttpOnly`, `SameSite=Lax`, `Secure` in production and `Path=/`.
- **Expiry:** absolute 2 hours (BR-10), no sliding renewal. An expired session returns 401 and the response clears the cookie. The expired row is not deleted in Sprint 1 (no cleanup job).
- **Current user:** `requireAuth` hashes the cookie token, finds the session, checks expiry, and attaches the user to the request. `GET /api/auth/me` returns `{ id, name, email, role }`.
- **Logout:** `POST /api/auth/logout` deletes the session row and clears the cookie. A request with the old token then returns 401.
- **Roles:** `requireRole("ADVISOR")` or `requireRole("STUDENT")` returns 403 for the other role.

This design is the same as the TokTickIT Lab 3 authentication, adapted to two roles.

## 8. Configuration and secrets

| Variable | Used by | Example (local) |
|---|---|---|
| `DATABASE_URL` | Server | `postgresql://adviseslot:adviseslot_dev@localhost:5433/adviseslot?schema=public` (local Docker database only) |
| `PORT` | Server | `3000` |
| `CLIENT_ORIGIN` | Server (CORS in development) | `http://localhost:5173` |
| `NODE_ENV` | Server | `development` or `production` |
| `APP_TIMEZONE` | Server rule calculations | `Asia/Bangkok` |
| `SEED_DEMO_PASSWORD` | Seed script | A local value of 12 or more characters (GCP: Secret Manager) |
| `CLIENT_DIST` | Server, production only (optional) | Path of the built client; default `../client/dist` relative to `server/dist` |
| `APP_COMMIT` | Server, `GET /api/version` | Set by `deploy/release.sh` on Cloud Run; `dev` when unset |
| `VITE_API_URL` | Client build, development only | `http://localhost:3000`. The Docker image is built without it and calls the API on the same origin. |

- `server/.env.example` and `client/.env.example` are committed with placeholder values. Real `.env` files are gitignored.
- The client never receives a secret. `VITE_*` variables are public by design and hold only the API URL.
- On GCP, `DATABASE_URL` and `SEED_DEMO_PASSWORD` are stored in Secret Manager. The service gets only `DATABASE_URL`; the migrate job gets both (`docs/labs/lab-05/deployment.md`).

## 9. Deployment design (implemented in Lab 5)

Until Lab 5, only the database runs in Docker (D-25, section 3.3). The application
image below is built in Lab 5, which also covers NFR-09.

| Component | Plan |
|---|---|
| Container | One multi-stage Dockerfile: build the client, build the server, then a slim Node runtime image that serves the API and the static client. |
| Compute | Google Cloud Run service running the image. Stateless, so it can restart at any time. |
| Database | Cloud SQL for PostgreSQL 17. Durable storage outside the container. |
| Secrets | Secret Manager for `DATABASE_URL`. |
| Images | Artifact Registry. |
| CI/CD | GitHub Actions. `ci-docker.yml`: on each PR and push to the sprint branch, install, build, run the server tests and the E2E journey, and build the Docker image; a failing required check blocks the merge. `deploy.yml`: on every push to `main`, run that CI first, then build and push the image tagged with the commit SHA, run the migrate job (`prisma migrate deploy`), update the Cloud Run service and smoke-test the public URL. There is no manual approval step; the GitHub environment `demo` only allows `main`. A manual run with an existing image tag rolls back. |

The exact GCP resources follow the course's Lab 5 instructions. This plan only fixes
the shape: stateless container, external managed database, secrets outside Git.

## 10. Repository layout

```
AdviseSlot/
  client/          React app
  server/          Express API, Prisma schema, migrations, seed
    src/domain/    Pure business-rule functions
    tests/         Vitest unit and Supertest integration tests
  e2e/             Playwright tests
  docs/            SRS, SDS, decisions, features, traceability, sprints/
```

Branches: `main` (accepted releases), `sprint-N` (integration branch of the current
sprint, `sprint-3` for the final release), and one work branch per Issue created from
`sprint-N` (`docs/workflow.md`). Each work branch is merged by the teammate after one
approving review.

## 11. Open items

| ID | Item | Waiting on |
|---|---|---|
| O-01 | A late slot created less than 2 hours before its start can never be booked, but would still notify every student. Reject its creation, or create it without notifications? | Closed in v0.3: rejected with `SLOT_UNBOOKABLE` (D-23) |
| O-02 | Slot status names for `/schedule` (FR-05): is an unbooked slot past its booking deadline "open" or "closed"? | Closed in v0.3: "Closed" (D-24, section 4.2) |
| O-03 | Does editing a slot's start time (FR-12) recompute `isLate`? | Closed in v0.7: yes, recomputed as if created now (D-28) |
