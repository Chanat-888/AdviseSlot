# F-07 Book slot: Engineering Contract

| Item | Value |
|---|---|
| Feature | F-07 Book slot |
| Sprint | 1 |
| Owner | Contract: Jeerasak Phisawong (reviewer: Chanat Dachkhumhang). Implementation: Chanat (Issue #11), reviewed by Jeerasak. |
| Status | Contract draft. Implementation not started (Issue #11). |
| Linked requirements | FR-07, BR-05, BR-06, BR-07, BR-09, BR-16 (rule), NFR-03, NFR-04, NFR-05 (see section 1) |
| Depends on | F-06 (the student picks from that list), F-04 (slots and the deadline rule) |
| Needed by | F-05 (Booked status), F-08, F-09 |
| Related documents | `docs/srs.md` (v0.4), `docs/features.md`, `docs/traceability.md`, `docs/system-sds.md` sections 2, 3, 4, 5, 6, `docs/decisions.md` (D-04, D-10, D-17), `docs/sprints/sprint-1/F-04-create-slot.md` (section 3.3) |

## Version history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-04 | Jeerasak (drafted with an AI agent) | First contract, written before implementation. Awaiting team review. |

## 1. Linked requirements

| ID | Text (short) | How F-07 meets it |
|---|---|---|
| FR-07 | A student books a bookable slot. | `POST /api/bookings` with `{ slotId }` (section 4). |
| BR-05 | A slot holds at most one active booking; of two parallel attempts exactly one succeeds. | Partial unique index on ACTIVE bookings per slot (section 6). A losing insert gets 409 `SLOT_TAKEN`. |
| BR-06 | Booking closes at 18:00 the previous day (morning) or 2 h before start (afternoon); at or after the deadline it is rejected. | `now >= bookingDeadline(slot)` gives 422 `BOOKING_DEADLINE_PASSED`. |
| BR-16 (rule) | A late slot is bookable until 2 h before its start. | `bookingDeadline` uses `startAt - 2 h` when `isLate` (F-04 section 3.3). |
| BR-07 | A student holds at most one active booking in total. Active = ACTIVE with slot end in the future. | Row lock on the student, then a count, inside the transaction (section 3.3). 409 `ACTIVE_BOOKING_LIMIT`. |
| BR-09 | A student acts only for themselves. | `studentId` comes from the session. Any `studentId` in the body is ignored. |
| NFR-03 | A user calling an operation for another role gets 403. | An advisor gets 403 `FORBIDDEN_ROLE` (AC-F07-07). |
| NFR-04 | 10 concurrent requests for one open slot create exactly 1 active booking. | AC-F07-03 against the real database. |
| NFR-05 | Rule times use Asia/Bangkok, including the 18:00 boundary. | AC-F07-04, AC-F07-05. |

## 2. Behavior and workflow

1. On `/slots` (F-06) the student clicks Book on a slot.
2. The client sends `POST /api/bookings` with `{ slotId }`.
3. `requireAuth`, then `requireRole("STUDENT")`.
4. The server validates the body (section 3.1) and runs the checks of section 3.2 in order.
5. Inside one database transaction:
   1. Lock the student's row: `SELECT id FROM "User" WHERE id = $studentId FOR UPDATE`. Two parallel requests by the same student now run one after the other (SDS section 3.1).
   2. Count the student's active bookings: `status = 'ACTIVE'` and the slot's `endAt > now`. If the count is 1 or more, 409 `ACTIVE_BOOKING_LIMIT`.
   3. Insert the `Booking` (`slotId`, `studentId` from the session, `status` ACTIVE, `createdAt` = now). If the partial unique index rejects it (another ACTIVE booking on the slot), roll back and answer 409 `SLOT_TAKEN`.
6. The server responds 201 with the new booking (section 4.2).
7. The client goes to `/bookings/:id` (F-09) and the slot no longer appears on `/slots`.

"Now" is the server clock in JavaScript, passed into the queries (for example `endAt > $now`), never the database `now()`.

Dependencies: F-04, F-06.

## 3. Validation, failures and boundaries

### 3.1 Input validation

| Field | Rule |
|---|---|
| `slotId` | Required. A positive integer. |
| `studentId` or any other field | Ignored. The student is always the session user. |
| Body | Must be a JSON object. |

A request that fails validation returns 400 `VALIDATION_ERROR` without touching the database.

### 3.2 Checks (in this order)

| # | Check | Rejected when | Response |
|---|---|---|---|
| 1 | Slot exists | No `Slot` with this id and `deletedAt` null | 404 `NOT_FOUND` |
| 2 | Slot not taken | The slot already has an ACTIVE booking | 409 `SLOT_TAKEN` |
| 3 | BR-06 / BR-16 deadline | `now >= bookingDeadline(slot)` (this also covers slots that have started or ended) | 422 `BOOKING_DEADLINE_PASSED` |
| 4 | BR-07 limit | In the transaction, after the lock: the student already has an active booking | 409 `ACTIVE_BOOKING_LIMIT` |
| 5 | BR-05 race | The insert violates the partial unique index (SQLSTATE `23505`) | 409 `SLOT_TAKEN` |

Check 2 gives a clear answer in the normal case. Check 5 is what makes BR-05 hold under concurrency: two requests can both pass check 2, but only one insert can succeed.

### 3.3 Failure and boundary cases

| Case | Result | Verified by |
|---|---|---|
| Open slot, student with no active booking | 201, booking ACTIVE | AC-F07-01 |
| Slot already booked by another student | 409 `SLOT_TAKEN`, no new row | AC-F07-02 |
| 10 parallel requests by 10 different students for one open slot | Exactly one 201; nine 409 `SLOT_TAKEN`; exactly 1 ACTIVE row | AC-F07-03 |
| Morning slot Tue 09:00: booking at Mon 17:59 / Mon 18:00 | 201 / 422 `BOOKING_DEADLINE_PASSED` | AC-F07-04 |
| Afternoon slot Tue 14:00: booking at 11:59 (2 h 01 min before) / 12:00 (exactly 2 h) | 201 / 422 `BOOKING_DEADLINE_PASSED` | AC-F07-04 |
| Late slot Wed 09:00 (created Tue 19:00): booking at Wed 06:59 / 07:00 | 201 / 422 `BOOKING_DEADLINE_PASSED` | AC-F07-05 |
| Student already holds an ACTIVE booking on a future slot | 409 `ACTIVE_BOOKING_LIMIT` | AC-F07-06 |
| Student's only ACTIVE booking is on a slot that has ended | 201 (it no longer counts, D-17) | AC-F07-06 |
| Advisor calls the endpoint | 403 `FORBIDDEN_ROLE`, no row | AC-F07-07 |
| Body has another student's `studentId` | Ignored; the booking belongs to the session user | AC-F07-07 |
| Unknown or deleted `slotId` | 404 `NOT_FOUND` | Section 3.2 |
| Missing or non-integer `slotId` | 400 `VALIDATION_ERROR` | AC-R02-01 (shared error shape) |
| No session | 401 `UNAUTHENTICATED` | AC-R01-01 (shared) |

The deadline comparison is "at or after is rejected", the same style as F-01's session expiry.

### 3.4 Permissions

| Caller | Allowed |
|---|---|
| Student | Yes. Books for themselves only. |
| Advisor | No. 403 `FORBIDDEN_ROLE`. |
| No valid session | No. 401 `UNAUTHENTICATED`. |

Matches SDS section 6 ("Book a slot": student only, self only, id from the session).

## 4. API contract

### 4.1 Request

`POST /api/bookings`, JSON body, `sid` cookie required.

```json
{ "slotId": 8 }
```

### 4.2 Success response

`201 Created`

```json
{
  "id": 12,
  "status": "Upcoming",
  "createdAt": "2026-11-09T03:00:00.000Z",
  "slot": {
    "id": 8,
    "startAt": "2026-11-10T02:30:00.000Z",
    "endAt": "2026-11-10T03:00:00.000Z"
  },
  "advisor": { "id": 1, "name": "Example Advisor" },
  "student": { "id": 3, "name": "Example Student" }
}
```

The shape is the same as `GET /api/bookings/:id` (F-09 section 4.2). `status` is the display status (D-24): a new booking is always "Upcoming". (Example values are placeholders.)

### 4.3 Error responses

| Status | `code` | `message` | When |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | "A slot is required." | Section 3.1 fails. |
| 401 | `UNAUTHENTICATED` | "You are not logged in." | No valid session. |
| 403 | `FORBIDDEN_ROLE` | "Only students can book slots." | Caller is an advisor. |
| 404 | `NOT_FOUND` | "This slot does not exist." | Check 1. |
| 409 | `SLOT_TAKEN` | "This slot has just been booked by someone else." | Checks 2 and 5. |
| 409 | `ACTIVE_BOOKING_LIMIT` | "You already have an upcoming booking." | Check 4. |
| 422 | `BOOKING_DEADLINE_PASSED` | "Booking for this slot closed at 18:00 on 9 Nov." (the time and date of that slot's deadline, Asia/Bangkok) | Check 3. |
| 500 | `INTERNAL_ERROR` | "Something went wrong." | Unexpected error. No stack trace or SQL error in the body. |

Format: SDS section 5. No new codes.

## 5. UI behavior

Screen `/slots`, role: student (the list itself is F-06).

| Part | Behavior |
|---|---|
| Book button | One per row. While the request runs that button is disabled with a spinner, so a double click sends one request. |
| Success | The client navigates to `/bookings/:id` (F-09) and shows "Booking confirmed." |
| 409 or 422 | A Bootstrap alert with the server's `message`, then the list reloads (the slot may have gone). |
| 401 | The client goes to `/login`. |

## 6. Data

| Layer | Change |
|---|---|
| New enum | `BookingStatus` (`ACTIVE`, `CANCELLED`). Only ACTIVE is written in Sprint 1. |
| New model | `Booking` (SDS section 3). The cancel fields (`cancelledAt`, `cancelledById`, `cancelReason`) are added by F-10 and F-11 in Sprint 2. |
| Existing | `Slot` gets `bookings`, `User` gets `bookings`. |
| Migration | A Prisma migration (for example `prisma migrate dev --name add_booking`) creates `Booking`. The same file gets the raw SQL partial unique index below. |
| Seed | When this PR lands, the seed (Issue #7) books some of the demo slots for seeded students. |

Planned Prisma model:

```prisma
enum BookingStatus {
  ACTIVE
  CANCELLED
}

model Booking {
  id        Int           @id @default(autoincrement())
  slotId    Int
  slot      Slot          @relation(fields: [slotId], references: [id], onDelete: Restrict)
  studentId Int
  student   User          @relation("StudentBookings", fields: [studentId], references: [id], onDelete: Restrict)
  status    BookingStatus @default(ACTIVE)
  createdAt DateTime      @db.Timestamptz(3)

  @@index([studentId])
}

// in model Slot, add:  bookings Booking[]
// in model User, add:  bookings Booking[] @relation("StudentBookings")
```

Raw SQL in the same migration (SDS section 3.1):

```sql
CREATE UNIQUE INDEX "Booking_one_active_per_slot"
  ON "Booking" ("slotId") WHERE "status" = 'ACTIVE';
```

BR-07 cannot be a static index because "active" depends on the current time (SDS section 3.1). It is enforced by the row lock and count in section 2, step 5.

## 7. Acceptance criteria

| AC | Criterion | Expected, observable outcome |
|---|---|---|
| AC-F07-01 | Student books a bookable slot and gets an ACTIVE booking. | 201. Body as section 4.2 with `status` "Upcoming". One `Booking` row: `slotId` = the slot, `studentId` = the session user, `status` ACTIVE. |
| AC-F07-02 | Booking an already booked slot returns 409 `SLOT_TAKEN`. | 409 `SLOT_TAKEN`. Still exactly one ACTIVE booking for the slot, owned by the first student. |
| AC-F07-03 | 10 concurrent requests for one open slot create exactly 1 active booking. | Of 10 parallel requests by 10 different students: exactly one 201, nine 409 `SLOT_TAKEN`, no 500. Exactly 1 ACTIVE row for the slot. |
| AC-F07-04 | Deadline boundaries: morning slot 17:59 previous day accepted, 18:00 rejected; afternoon slot 2 h 01 min before accepted, exactly 2 h rejected. | Tue 09:00 slot: 201 at Mon 17:59, 422 `BOOKING_DEADLINE_PASSED` at Mon 18:00. Tue 14:00 slot: 201 at Tue 11:59, 422 at Tue 12:00. |
| AC-F07-05 | A late slot is bookable until 2 h before start and rejected from then on. | Late Wed 09:00 slot: 201 at Wed 06:59, 422 `BOOKING_DEADLINE_PASSED` at Wed 07:00. |
| AC-F07-06 | A student with an active booking cannot book a second slot; a booking whose slot has ended does not count. | With an ACTIVE booking on a future slot: 409 `ACTIVE_BOOKING_LIMIT`, no new row. With an ACTIVE booking only on an ended slot: 201. |
| AC-F07-07 | An advisor booking gets 403; the student id is taken from the session, not the request. | Advisor: 403 `FORBIDDEN_ROLE`, no row. Student S1 sending `studentId` of S2: 201 and the row has `studentId` = S1. |

## 8. Software Test Specification (STS)

Test files:
- `server/tests/bookings.create.test.ts` (API, Supertest against the `_test` database)
- `server/tests/domain.rules.test.ts` (unit tests of `bookingDeadline` at the boundaries)

Test clock: fake `Date` as in F-01. Times are Asia/Bangkok. Unless stated, now = Mon 9 Nov 10:00. Slots are inserted with Prisma (with the right `isLate`), so the booking time can be set freely. Each test gets its own students so BR-07 does not interfere.

| TEST | AC | Level | Precondition / input | Action | Expected |
|---|---|---|---|---|---|
| TEST-F07-01 | AC-F07-01 | API | Open slot Tue 10 Nov 09:30 (advisor A). Student S1 logged in, no bookings. | `POST /api/bookings` `{ slotId }`. | 201, body as section 4.2, `status` "Upcoming". One ACTIVE row with `studentId` = S1. |
| TEST-F07-02 | AC-F07-02 | API | Slot already has an ACTIVE booking by S1. S2 logged in. | S2: `POST /api/bookings` `{ slotId }`. | 409 `SLOT_TAKEN`. One ACTIVE row, `studentId` = S1. |
| TEST-F07-03 | AC-F07-03 | API (database, concurrency) | One Open slot. 10 students created for this test, each logged in. | Send the 10 `POST` requests together with `Promise.all`. | Exactly one 201 and nine 409 `SLOT_TAKEN`, no 500. `Booking` count with `status` ACTIVE for the slot is 1. |
| TEST-F07-04 | AC-F07-04 | Unit + API | Slots Tue 10 Nov 09:00 and Tue 10 Nov 14:00, `isLate` false. | Unit: `bookingDeadline` of both. API: book Tue 09:00 at Mon 17:59 (S1) and at Mon 18:00 (S2); book Tue 14:00 at Tue 11:59 (S3) and at Tue 12:00 (S4). | Unit: Mon 18:00 and Tue 12:00. API: 201, 422 `BOOKING_DEADLINE_PASSED`, 201, 422. |
| TEST-F07-05 | AC-F07-05 | Unit + API | Late slot Wed 11 Nov 09:00 (`isLate` true, created Tue 19:00). | Unit: `bookingDeadline` is Wed 07:00. API: book at Wed 06:59 (S1), and on a second identical late slot at Wed 07:00 (S2). | 201, then 422 `BOOKING_DEADLINE_PASSED`. |
| TEST-F07-06 | AC-F07-06 | API | S1 has an ACTIVE booking on Tue 10:00. S2 has an ACTIVE booking on Fri 6 Nov 10:00 (ended). Two Open slots. | S1 books an Open slot. S2 books an Open slot. | S1: 409 `ACTIVE_BOOKING_LIMIT`, no new row. S2: 201. |
| TEST-F07-07 | AC-F07-07 | API | Open slots. Advisor A logged in. S1 and S2 exist, S1 logged in. | A: `POST /api/bookings`. S1: `POST` with `{ slotId, studentId: S2.id }`. | A: 403 `FORBIDDEN_ROLE`, no row. S1: 201 and the row's `studentId` is S1. |

UI/E2E: the Playwright journey (Issue #13) books a slot as a student and opens the booking; it also triggers one rule rejection to show the server's message (AC-R02-02). It adds no new TEST id to F-07.

### 8.1 TDD plan

The `bookingDeadline` unit tests (TEST-F07-04 and -05, unit part) are written first and shown failing, then TEST-F07-01 to -07 at API level, then the endpoint. TEST-F07-03 runs against the real PostgreSQL test database (not a mock), as NFR-04 requires. The failing runs are kept as evidence.

## 9. Known limitations (Sprint 1)

- No cancel and no reschedule (F-10, F-11, F-14, Sprint 2). A booking stays ACTIVE until its slot ends.
- `BOOKING_DEADLINE_PASSED` is also the answer for a slot that has already started or ended; there is no separate code (SDS section 5 has none).

## 10. Completion evidence

Failing-then-passing runs, the concurrency test output (NFR-04), `npm test` output with counts, PR link and reviewer, Issue link (#11). See `definition-of-done.md`.
