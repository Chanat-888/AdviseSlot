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
  R --> S[Services<br/>bookingService, slotService,<br/>notificationService]
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
| `Session.tokenHash` unique | Session lookup | Prisma `@unique` |
| `Slot.endAt = startAt + 30 min` | BR-01 | Computed by the service. `CHECK ("endAt" = "startAt" + interval '30 minutes')` in a raw SQL migration. |
| No overlapping slots per advisor | BR-04 | Service check in a transaction, plus an exclusion constraint `EXCLUDE USING gist ("advisorId" WITH =, tstzrange("startAt", "endAt") WITH &&) WHERE ("deletedAt" IS NULL)` (needs `CREATE EXTENSION IF NOT EXISTS btree_gist`). Identifiers are quoted because Prisma creates camelCase column names. |
| One ACTIVE booking per slot | BR-05 | Partial unique index `CREATE UNIQUE INDEX ON "Booking"("slotId") WHERE status = 'ACTIVE'`. A second concurrent insert fails, and the service returns 409 `SLOT_TAKEN`. |
| One active booking per student | BR-07 | Depends on the current time, so a static index cannot express it. The booking transaction first locks the student's `User` row (`SELECT ... FOR UPDATE`), then counts active bookings. Two parallel requests by one student run one after the other. |
| Late slot flag | BR-06, BR-16 | When a slot is created, the service compares the server's "now" with the slot's normal BR-06 deadline and stores `isLate`. A late slot that starts 2 hours or less from now is rejected with 422 `SLOT_UNBOOKABLE` (D-23), so no notification is sent for it. The booking deadline is then the normal BR-06 deadline if `isLate` is false, and start - 2 hours if it is true. The flag is stored so the deadline does not change later. |
| One notification per student per late slot | FR-19 | Unique index on `Notification("studentId", "slotId")`. The late slot and one `Notification` row per student are inserted in the same transaction. |
| Foreign keys | Ownership links | `Slot.advisorId`, `Booking.slotId`, `Booking.studentId`, `Booking.cancelledById`, `Notification.studentId`, `Notification.slotId` reference their parents. Deletes are restricted. |

### 3.2 Ownership

- A slot belongs to `Slot.advisorId`.
- A booking belongs to its student (`Booking.studentId`) and is visible to the
  advisor who owns the slot (`Booking.slot.advisorId`).
- A notification belongs to its student (`Notification.studentId`).

### 3.3 Database setup, migrations and seed

- Local development (D-25): `docker compose up -d db` starts PostgreSQL 17 from `docker-compose.yml` at the repo root, on host port 5433 (so it does not clash with a locally installed PostgreSQL on 5432), with a named volume for data. The server and client run on the host with `npm run dev`.
- `npx prisma migrate dev` applies all migrations locally. `npx prisma migrate deploy` applies them in Docker and on GCP.
- Raw SQL migrations add the `btree_gist` extension, the CHECK constraint, the exclusion constraint and the partial unique index.
- `npx prisma db seed` runs `server/prisma/seed.ts`. It is idempotent and creates synthetic data: 2 advisors, 3 students and a set of future slots, some already booked. The demo password is defined in the seed for local use only and is listed in the README, not in the PDF.

## 4. UI structure and conventions

### 4.1 Screens and navigation

| Route | Role | Screen | Sprint |
|---|---|---|---|
| `/login` | Anyone | Email and password form | 1 |
| `/slots` | Student | Bookable slots grouped by date, with advisor, time, deadline and a Book button | 1 (filters in 3) |
| `/bookings` | Student | My bookings: Upcoming, Passed, Cancelled (with who cancelled and the reason from Sprint 3) | 1 |
| `/bookings/:id` | Student, Advisor | Booking detail | 1 |
| `/schedule` | Advisor | My schedule: create-slot form (weekday date, start time from 08:00 to 17:30 in 30-minute steps) and list of own slots with status (Open, Booked, Closed, Passed) and student name | 1 |
| `/history` | Advisor | Cancelled and passed bookings on own slots, with who cancelled and the reason | 3 |
| `/summary` | Advisor | Appointment summary for a date range | 3 |
| `/notifications` | Student | Late-slot notifications, newest first, with a Mark as read button | 3 |

The top bar shows the user's name and role and a Logout button. From Sprint 3 it
also shows students the number of unread notifications. After login the
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
| 409 | Conflict with existing data | `SLOT_TAKEN`, `SLOT_OVERLAP`, `ACTIVE_BOOKING_LIMIT`, `SLOT_HAS_ACTIVE_BOOKING` (Sprint 2) |
| 422 | Valid input that breaks a business rule | `SLOT_OUTSIDE_HOURS`, `SLOT_NOT_WEEKDAY`, `SLOT_INVALID_START_MINUTE`, `SLOT_IN_PAST`, `SLOT_UNBOOKABLE`, `BOOKING_DEADLINE_PASSED`, `CANCEL_WINDOW_PASSED` (Sprint 2) |
| 500 | Unexpected error. Generic message only; details go to the server log. | `INTERNAL_ERROR` |

### 5.1 Endpoint overview

Detailed request and response shapes belong in each feature contract.

| Method and path | Role | Purpose | Sprint |
|---|---|---|---|
| `POST /api/auth/login` | Anyone | Log in | 1 |
| `POST /api/auth/logout` | Any logged-in | Log out | 1 |
| `GET /api/auth/me` | Any logged-in | Current user | 1 |
| `POST /api/slots` | Advisor | Create a slot (`{ startAt }`) | 1 |
| `GET /api/slots/mine` | Advisor | Own slots with booking status | 1 |
| `GET /api/slots/bookable` | Student | Bookable slots of all advisors | 1 |
| `POST /api/bookings` | Student | Book a slot (`{ slotId }`) | 1 |
| `GET /api/bookings/mine` | Student | Own bookings | 1 |
| `GET /api/bookings/:id` | Student owner, slot's advisor | Booking detail | 1 |
| `POST /api/bookings/:id/cancel` | Student owner, slot's advisor | Cancel (advisor sends `{ reason }`) | 2 |
| `POST /api/bookings/:id/reschedule` | Student owner | Move to another slot (`{ newSlotId }`) | 2 |
| `PATCH /api/slots/:id` | Advisor owner | Change start time | 2 |
| `DELETE /api/slots/:id` | Advisor owner | Delete unbooked slot | 2 |
| `POST /api/slots/batch` | Advisor | Create consecutive slots | 2 |
| `GET /api/advisors` | Student | Advisor list for filtering | 3 |
| `GET /api/summary?from=&to=` | Advisor | Appointment summary | 3 |
| `GET /api/bookings/history` | Student, Advisor | Cancelled and passed bookings with who cancelled and the reason (FR-18). Student: own bookings. Advisor: bookings on own slots. | 3 |
| `GET /api/notifications` | Student | Own notifications, newest first, with unread count | 3 |
| `POST /api/notifications/:id/read` | Student owner | Mark one notification as read | 3 |

## 6. Roles and permissions

| Operation | Student | Advisor | Record scope |
|---|---|---|---|
| Log in, log out, view own identity | Yes | Yes | Own session only |
| View bookable slots | Yes | No (403) | All advisors' open future slots, without booker identity |
| Book a slot | Yes | No (403) | Self only. The student id comes from the session, never from the request. |
| List own bookings | Yes | No (403) | Only bookings where `studentId` = current user |
| View booking detail | Yes | Yes | Student: only bookings where `studentId` = current user. Advisor: only bookings on own slots. Otherwise 404. |
| Create, edit, delete slot | No (403) | Yes | Only slots where `advisorId` = current user, otherwise 404 |
| View own slots with student names | No (403) | Yes | Only own slots |
| Cancel booking (Sprint 2) | Own, BR-11 | Own slots, BR-12 | As above |
| Reschedule (Sprint 2) | Own | No (403) | As above |
| Appointment summary (Sprint 3) | No (403) | Yes | Only own slots |
| Booking history (Sprint 3) | Own | Own slots | Student: `studentId` = current user. Advisor: bookings on own slots. |
| List and mark notifications (Sprint 3) | Yes | No (403) | Only notifications where `studentId` = current user, otherwise 404 |

The backend checks every row in this table. Hiding a button in the UI does not count as authorization.

## 7. Authentication and sessions

- **Passwords:** hashed with bcrypt, cost 12. Plaintext is never stored or logged.
- **Login:** `POST /api/auth/login` with `{ email, password }`. An unknown email and a wrong password return the same 401 `INVALID_CREDENTIALS`, with similar timing (a dummy bcrypt compare runs for unknown emails).
- **Session creation:** the server generates a random 32-byte token, stores only its SHA-256 hash in `Session` with `expiresAt` = now + 2 hours, and sets a cookie `sid` with `HttpOnly`, `SameSite=Lax`, `Secure` in production and `Path=/`.
- **Expiry:** absolute 2 hours (BR-10), no sliding renewal. An expired session returns 401.
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
| `VITE_API_URL` | Client build | `http://localhost:3000` |

- `server/.env.example` and `client/.env.example` are committed with placeholder values. Real `.env` files are gitignored.
- The client never receives a secret. `VITE_*` variables are public by design and hold only the API URL.
- On GCP, `DATABASE_URL` is stored in Secret Manager and injected into the service at runtime.

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
| CI/CD | GitHub Actions: on each PR, install, build and run all tests; a failing required check blocks the merge. On merge to `main`, build the image, run `prisma migrate deploy`, and deploy to Cloud Run after a manual approval step. |

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

Branches: `main` (accepted releases), `sprint-1` (staging), and one feature branch
per Issue created from `sprint-1`. Both `main` and `sprint-1` need one approving
teammate review before a merge.

## 11. Open items

| ID | Item | Waiting on |
|---|---|---|
| O-01 | A late slot created less than 2 hours before its start can never be booked, but would still notify every student. Reject its creation, or create it without notifications? | Closed in v0.3: rejected with `SLOT_UNBOOKABLE` (D-23) |
| O-02 | Slot status names for `/schedule` (FR-05): is an unbooked slot past its booking deadline "open" or "closed"? | Closed in v0.3: "Closed" (D-24, section 4.2) |
| O-03 | Does editing a slot's start time (FR-12) recompute `isLate`? | Team decision in Sprint 2 |
