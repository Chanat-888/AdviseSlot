# F-07 Book slot: Engineering Contract

| Item | Value |
|---|---|
| Feature | F-07 Book slot |
| Sprint | 1 |
| Owner | Contract: Jeerasak Phisawong (reviewer: Chanat Dachkhumhang). Implementation: Chanat (Issue #11), reviewed by Jeerasak. |
| Status | Sprint 1 implemented (Issue #11). v0.3 revises BR-07 for Lab 7 change request #67; that change is not implemented yet. |
| Linked requirements | FR-07, BR-05, BR-06, BR-07, BR-09, BR-16 (rule), NFR-03, NFR-04, NFR-05 (see section 1) |
| Depends on | F-06 (the student picks from that list), F-04 (slots and the deadline rule) |
| Needed by | F-05 (Booked status), F-08, F-09 |
| Related documents | `docs/srs.md` (v0.5), `docs/features.md`, `docs/traceability.md`, `docs/system-sds.md` sections 2, 3, 4, 5, 6, `docs/decisions.md` (D-04, D-10, D-17, D-31), `docs/sprints/sprint-1/F-04-create-slot.md` (section 3.3) |

## Version history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-04 | Jeerasak (drafted with an AI agent) | First contract, written before implementation. Awaiting team review. |
| 0.2 | 2026-11-05 | Jeerasak (drafted with an AI agent) | Review on PR #21: TEST-F07-04 and -05 use advisor B's identical slots for the rejected cases; Prisma `P2002` mapping noted; TEST-F07-03 uses a shared precomputed hash. |
| 0.3 | 2026-11-23 | Chanat (drafted with an AI agent) | Lab 7 change request #67 (D-31), approved by TA Supachok Deetaweesukh on 2026-11-22: BR-07 allows at most two active bookings, at most one with the same advisor. Check 4 split into 4a `SAME_ADVISOR_BOOKING` (new code) and 4b `ACTIVE_BOOKING_LIMIT` (new message); boundary table, AC-F07-06 and TEST-F07-06 revised; new TEST-F07-08 for two parallel requests by one student (TA condition); E2E second-booking step becomes a same-advisor case. Written before the code change, for review. |
| 0.4 | 2026-11-23 | Chanat (drafted with an AI agent) | Review of PR #80: the red tests run on the `sprint-2` commit right before the Lab 7 implementation commit, and #67 merges before the F-13 code PR (section 8.1); new boundary row and case S10 for a booking whose slot ends exactly now (D-17). |

## 1. Linked requirements

| ID | Text (short) | How F-07 meets it |
|---|---|---|
| FR-07 | A student books a bookable slot. | `POST /api/bookings` with `{ slotId }` (section 4). |
| BR-05 | A slot holds at most one active booking; of two parallel attempts exactly one succeeds. | Partial unique index on ACTIVE bookings per slot (section 6). A losing insert gets 409 `SLOT_TAKEN`. |
| BR-06 | Booking closes at 18:00 the previous day (morning) or 2 h before start (afternoon); at or after the deadline it is rejected. | `now >= bookingDeadline(slot)` gives 422 `BOOKING_DEADLINE_PASSED`. |
| BR-16 (rule) | A late slot is bookable until 2 h before its start. | `bookingDeadline` uses `startAt - 2 h` when `isLate` (F-04 section 3.3). |
| BR-07 | A student holds at most two active bookings in total, and at most one with the same advisor. Active = ACTIVE with slot end in the future; ended and cancelled bookings do not count. | Row lock on the student, then the checks 4a and 4b inside the transaction (section 2, step 5). 409 `SAME_ADVISOR_BOOKING` or 409 `ACTIVE_BOOKING_LIMIT`. |
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
   2. Load the student's active bookings: `status = 'ACTIVE'` and the slot's `endAt > now`. If one of them is with the requested slot's advisor (`Slot.advisorId`), 409 `SAME_ADVISOR_BOOKING`. Otherwise, if there are 2 or more, 409 `ACTIVE_BOOKING_LIMIT`.
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
| 4a | BR-07 same advisor | In the transaction, after the lock: the student already has an active booking with this slot's advisor | 409 `SAME_ADVISOR_BOOKING` |
| 4b | BR-07 limit | In the transaction, after the lock: the student already has 2 or more active bookings | 409 `ACTIVE_BOOKING_LIMIT` |
| 5 | BR-05 race | The insert violates the partial unique index (SQLSTATE `23505`) | 409 `SLOT_TAKEN` |

Through Prisma, the partial unique index violation is expected as `PrismaClientKnownRequestError` with code `P2002`; the implementation maps that (not the raw SQLSTATE) and a test confirms it, so a race never becomes a 500.

Check 4a comes before 4b, so a student with 2 active bookings who asks for another slot of one of those advisors gets the more specific `SAME_ADVISOR_BOOKING`.

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
| 0 active bookings, books a slot of advisor A | 201 | AC-F07-06 |
| 1 active with A, books a slot of advisor B | 201 (was 409 before #67) | AC-F07-06 |
| 1 active with A, books another slot of A | 409 `SAME_ADVISOR_BOOKING`, no new row | AC-F07-06 |
| 2 active (A and B), books a slot of advisor C | 409 `ACTIVE_BOOKING_LIMIT`, no new row | AC-F07-06 |
| 2 active (A and B), books another slot of A | 409 `SAME_ADVISOR_BOOKING` (check 4a first), no new row | AC-F07-06 |
| 1 ACTIVE on an ended slot of A + 1 active with B, books a slot of A | 201 (the ended booking does not count, D-17) | AC-F07-06 |
| 1 CANCELLED booking on a future slot of A, books a slot of A | 201 (a cancelled booking does not count) | AC-F07-06 |
| 1 ACTIVE with A on a slot that ends exactly now (`endAt = now`), books another slot of A | 201 (active needs `endAt > now`, D-17) | AC-F07-06 |
| Same student, 1 active with A, sends 2 parallel requests for slots of B and C | Exactly one 201 and one 409 `ACTIVE_BOOKING_LIMIT`; 2 active bookings afterwards | AC-F07-06 |
| Same student, no bookings, sends 2 parallel requests for two slots of A | Exactly one 201 and one 409 `SAME_ADVISOR_BOOKING`; 1 active booking with A afterwards | AC-F07-06 |
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
| 409 | `SAME_ADVISOR_BOOKING` | "You already have an upcoming booking with this advisor." | Check 4a (new in v0.3, #67). |
| 409 | `ACTIVE_BOOKING_LIMIT` | "You already have 2 upcoming bookings." | Check 4b (message changed in v0.3, #67; was "You already have an upcoming booking."). |
| 422 | `BOOKING_DEADLINE_PASSED` | "Booking for this slot closed at 18:00 on 9 Nov." (the time and date of that slot's deadline, Asia/Bangkok) | Check 3. |
| 500 | `INTERNAL_ERROR` | "Something went wrong." | Unexpected error. No stack trace or SQL error in the body. |

Format: SDS section 5. One new code, `SAME_ADVISOR_BOOKING` (#67), added to the SDS 409 list.

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

BR-07 cannot be a static index because "active" depends on the current time (SDS section 3.1). It is enforced by the row lock and the checks in section 2, step 5.

## 7. Acceptance criteria

| AC | Criterion | Expected, observable outcome |
|---|---|---|
| AC-F07-01 | Student books a bookable slot and gets an ACTIVE booking. | 201. Body as section 4.2 with `status` "Upcoming". One `Booking` row: `slotId` = the slot, `studentId` = the session user, `status` ACTIVE. |
| AC-F07-02 | Booking an already booked slot returns 409 `SLOT_TAKEN`. | 409 `SLOT_TAKEN`. Still exactly one ACTIVE booking for the slot, owned by the first student. |
| AC-F07-03 | 10 concurrent requests for one open slot create exactly 1 active booking. | Of 10 parallel requests by 10 different students: exactly one 201, nine 409 `SLOT_TAKEN`, no 500. Exactly 1 ACTIVE row for the slot. |
| AC-F07-04 | Deadline boundaries: morning slot 17:59 previous day accepted, 18:00 rejected; afternoon slot 2 h 01 min before accepted, exactly 2 h rejected. | Tue 09:00 slot: 201 at Mon 17:59, 422 `BOOKING_DEADLINE_PASSED` at Mon 18:00. Tue 14:00 slot: 201 at Tue 11:59, 422 at Tue 12:00. |
| AC-F07-05 | A late slot is bookable until 2 h before start and rejected from then on. | Late Wed 09:00 slot: 201 at Wed 06:59, 422 `BOOKING_DEADLINE_PASSED` at Wed 07:00. |
| AC-F07-06 | A student holds at most two active bookings and at most one with the same advisor; ended and cancelled bookings do not count; this also holds for parallel requests by the same student. | The ten BR-07 rows of section 3.3: 201, or 409 `SAME_ADVISOR_BOOKING` / `ACTIVE_BOOKING_LIMIT` with no new row. A student never ends up with 3 active bookings, or 2 with one advisor. |
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
| TEST-F07-03 | AC-F07-03 | API (database, concurrency) | One Open slot. 10 students created for this test, each logged in. The students share one precomputed bcrypt hash (test helper) so the setup stays within Vitest's timeout. | Send the 10 `POST` requests together with `Promise.all`. | Exactly one 201 and nine 409 `SLOT_TAKEN`, no 500. `Booking` count with `status` ACTIVE for the slot is 1. |
| TEST-F07-04 | AC-F07-04 | Unit + API | Slots Tue 10 Nov 09:00 and Tue 10 Nov 14:00, `isLate` false, for advisor A, and the same two slots for advisor B (so each rejected case has its own unbooked slot; `Slot_no_overlap` is per advisor). | Unit: `bookingDeadline` of both. API: S1 books A's Tue 09:00 at Mon 17:59; S2 books B's Tue 09:00 at Mon 18:00; S3 books A's Tue 14:00 at Tue 11:59; S4 books B's Tue 14:00 at Tue 12:00. | Unit: Mon 18:00 and Tue 12:00. API: 201, 422 `BOOKING_DEADLINE_PASSED`, 201, 422. |
| TEST-F07-05 | AC-F07-05 | Unit + API | Late slot Wed 11 Nov 09:00 (`isLate` true, created Tue 19:00) for advisor A, and an identical late slot for advisor B. | Unit: `bookingDeadline` is Wed 07:00. API: S1 books A's slot at Wed 06:59; S2 books B's slot at Wed 07:00. | 201, then 422 `BOOKING_DEADLINE_PASSED`. |
| TEST-F07-06 | AC-F07-06 | API | Advisors A, B, C with Open slots. Students S1 to S7 and S10 with the existing bookings of section 8.2. | Each student books the slot given in section 8.2. | As section 8.2. Rejected cases add no row. |
| TEST-F07-07 | AC-F07-07 | API | Open slots. Advisor A logged in. S1 and S2 exist, S1 logged in. | A: `POST /api/bookings`. S1: `POST` with `{ slotId, studentId: S2.id }`. | A: 403 `FORBIDDEN_ROLE`, no row. S1: 201 and the row's `studentId` is S1. |
| TEST-F07-08 | AC-F07-06 | API (database, concurrency) | (a) S8 has 1 ACTIVE booking with A; Open slots of B and C. (b) S9 has no bookings; two Open slots of A at different times. | (a) S8 sends both `POST` requests (the B slot and the C slot) together with `Promise.all`. (b) S9 sends both `POST` requests (the two A slots) together with `Promise.all`. | (a) Exactly one 201 and one 409 `ACTIVE_BOOKING_LIMIT`, no 500; S8 has exactly 2 ACTIVE bookings. (b) Exactly one 201 and one 409 `SAME_ADVISOR_BOOKING`, no 500; S9 has exactly 1 ACTIVE booking. Which request wins is not fixed. |

UI/E2E: the Playwright journey (Issue #13) books a slot as a student and opens the booking; it also triggers one rule rejection to show the server's message (AC-R02-02). It adds no new TEST id to F-07.

Planned E2E change for #67 (made with the implementation, not in this contract PR): the journey step "a second booking is refused" becomes a same-advisor case. The student books a slot of advisor A, then tries another slot of A, and the alert shows "You already have an upcoming booking with this advisor." A second booking with a different advisor now succeeds, so it can no longer show a rejection.

### 8.2 TEST-F07-06 cases (BR-07 after #67)

Now = Mon 9 Nov 10:00. Bookings are on future slots unless stated. Each student books a different Open slot, so BR-05 does not interfere.

| Student | Existing bookings | Books a slot of | Expected |
|---|---|---|---|
| S1 | none | A | 201 |
| S2 | 1 ACTIVE with A | B | 201 |
| S3 | 1 ACTIVE with A | A (another slot) | 409 `SAME_ADVISOR_BOOKING` |
| S4 | 1 ACTIVE with A, 1 ACTIVE with B | C | 409 `ACTIVE_BOOKING_LIMIT` |
| S5 | 1 ACTIVE with A, 1 ACTIVE with B | A (another slot) | 409 `SAME_ADVISOR_BOOKING` |
| S6 | 1 ACTIVE with A on Fri 6 Nov 10:00 (ended), 1 ACTIVE with B | A | 201 |
| S7 | 1 CANCELLED with A on a future slot | A | 201 |
| S10 | 1 ACTIVE with A on Mon 9 Nov 09:30-10:00 (ends exactly now) | A (another slot) | 201 |

**Revised expected result.** The Sprint 1 TEST-F07-06 expected 409 `ACTIVE_BOOKING_LIMIT` when a student with one active booking books a second slot. Under the new BR-07 that case is 201 when the second slot is with another advisor (S2) and 409 `SAME_ADVISOR_BOOKING` when it is with the same advisor (S3). This is a legitimate revision: the requirement itself changed through change request #67, approved by the TA (D-31) before any code change, so the test follows the new requirement; it is not changed to fit the code. On the pre-change code (section 8.1) cases S2, S3, S5 and S6 and both parts of TEST-F07-08 fail. The ended-booking case (old S2, now S6) keeps its meaning, but S6 now also holds an active booking with B.

### 8.1 TDD plan

The `bookingDeadline` unit tests (TEST-F07-04 and -05, unit part) are written first and shown failing, then TEST-F07-01 to -07 at API level, then the endpoint. TEST-F07-03 runs against the real PostgreSQL test database (not a mock), as NFR-04 requires. The failing runs are kept as evidence.

For #67 (Lab 7): the revised TEST-F07-06 and the new TEST-F07-08 are committed first and run on the `sprint-2` commit right before the Lab 7 implementation commit, and the red output is saved. That commit is the actual pre-change implementation; its BR-07 code is the same as the deployed pre-change version `main` = `c4dc3b4`. Then checks 4a and 4b are implemented and the same tests, plus the full server suite, run green. Merge order agreed in the review of PR #80: the #67 implementation merges into `sprint-2` before the F-13 code PR (which also changes `createBooking`), so the code that #67 changes is still the Sprint 1 BR-07 code.

## 9. Known limitations (Sprint 1)

- No cancel and no reschedule (F-10, F-11, F-14, Sprint 2). A booking stays ACTIVE until its slot ends.
- `BOOKING_DEADLINE_PASSED` is also the answer for a slot that has already started or ended; there is no separate code (SDS section 5 has none).

## 10. Completion evidence

Failing-then-passing runs, the concurrency test output (NFR-04), `npm test` output with counts, PR link and reviewer, Issue link (#11). See `definition-of-done.md`.
