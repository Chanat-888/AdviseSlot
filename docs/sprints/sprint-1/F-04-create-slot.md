# F-04 Create slot: Engineering Contract

| Item | Value |
|---|---|
| Feature | F-04 Create slot |
| Sprint | 1 |
| Owner | Jeerasak Phisawong (reviewer: Chanat Dachkhumhang) |
| Status | Contract draft. Implementation not started (Issue #10). |
| Linked requirements | FR-04, BR-01, BR-02, BR-03, BR-04, BR-08, BR-16 (rule), NFR-03, NFR-05 (see section 1) |
| Depends on | F-01 (session and `requireAuth`) |
| Needed by | F-05, F-06, F-07 |
| Related documents | `docs/srs.md` (v0.4), `docs/features.md`, `docs/traceability.md`, `docs/system-sds.md` sections 2, 3, 4, 5, 6, `docs/decisions.md` (D-14, D-15, D-16, D-23, D-24) |

## Version history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-04 | Jeerasak (drafted with an AI agent) | First contract, written before implementation. Awaiting team review. |
| 0.2 | 2026-11-05 | Jeerasak (drafted with an AI agent) | Review on PR #21: how `23P01` reaches the code through Prisma; seed demo slots relative to now and idempotent. |

## 1. Linked requirements

| ID | Text (short) | How F-04 meets it |
|---|---|---|
| FR-04 | An advisor creates a slot by choosing a date and a start time. The end is start + 30 minutes. | `POST /api/slots` with `{ startAt }` (section 4). |
| BR-01 | Every slot is exactly 30 minutes. The client sends only the start time. | The server sets `endAt = startAt + 30 min` and ignores any `endAt` in the body. A CHECK constraint backs it (section 6). |
| BR-02 | Weekday, start on :00 or :30, start at or after 08:00, end at or before 18:00 (Asia/Bangkok). | Rule checks in `server/src/domain/rules.ts` (section 3.2). |
| BR-03 | A slot cannot be created with a start time in the past. | `SLOT_IN_PAST` (section 3.2). |
| BR-04 | An advisor's slots cannot overlap. | Service check plus a database exclusion constraint (section 6). |
| BR-08 | Only advisors create slots, and only their own. | `requireRole("ADVISOR")`. The advisor id comes from the session, never the body. |
| BR-16 (rule) | A slot created at or after its normal BR-06 deadline is a late slot. It is allowed only if it starts more than 2 hours from now, and stays bookable until 2 hours before its start. | `isLate` is computed and stored at creation. A late slot starting 2 hours or less from now is rejected with `SLOT_UNBOOKABLE` (D-23). The notification (FR-19) is Sprint 3. |
| NFR-03 | A user calling an operation for another role gets 403. | A student gets 403 `FORBIDDEN_ROLE` (AC-F04-05). |
| NFR-05 | Rule times use Asia/Bangkok local time, including the boundaries. | Boundary unit tests on the rule functions (section 8). |

## 2. Behavior and workflow

1. The advisor opens `/schedule`, picks a weekday date and a start time (08:00 to 17:30 in 30-minute steps), and clicks Create.
2. The client converts the local Asia/Bangkok date and time to a UTC ISO string and sends `POST /api/slots` with `{ startAt }`.
3. `requireAuth` loads the user (F-01 section 3.4). `requireRole("ADVISOR")` rejects a student with 403.
4. The server validates the body (section 3.1) and runs the slot rules in the order of section 3.2. The first failing rule decides the response.
5. The server computes `endAt = startAt + 30 min`, the normal BR-06 deadline, and `isLate` (section 3.3).
6. Inside one transaction the server checks for an overlapping slot of the same advisor and inserts the `Slot` row with `advisorId` from the session, `createdAt` = now and `isLate`. If the exclusion constraint fires (a parallel insert), the result is also 409 `SLOT_OVERLAP`.
7. The server responds 201 with the new slot (section 4.2). The client adds it to the list on `/schedule` (F-05).

"Now" is the server clock in JavaScript (`new Date()`), never a time from the client and never the database `now()`, so tests can fake it (same approach as F-01 section 8).

Dependencies: F-01.

## 3. Validation, failures and boundaries

### 3.1 Input validation

| Field | Rule |
|---|---|
| `startAt` | Required. A string in ISO 8601 with a time zone (`Z` or an offset), that parses to a valid instant. |
| `endAt`, `advisorId`, `isLate` or any other field | Ignored. The server computes them. |
| Body | Must be a JSON object. |

A request that fails validation returns 400 `VALIDATION_ERROR` without touching the database.

### 3.2 Rule checks (in this order)

All local times are Asia/Bangkok (UTC+7, no daylight saving). `local(x)` is `x` in that zone.

| # | Rule | Rejected when | Response |
|---|---|---|---|
| 1 | BR-02 weekday (D-14) | `local(startAt)` is a Saturday or Sunday | 422 `SLOT_NOT_WEEKDAY` |
| 2 | BR-02 start minute (D-15) | `local(startAt)` minutes are not 0 or 30, or seconds or milliseconds are not 0 | 422 `SLOT_INVALID_START_MINUTE` |
| 3 | BR-02 hours | `local(startAt)` is before 08:00, or `local(endAt)` is after 18:00 (so the last start is 17:30) | 422 `SLOT_OUTSIDE_HOURS` |
| 4 | BR-03 past | `startAt <= now` | 422 `SLOT_IN_PAST` |
| 5 | BR-16 / D-23 late and unbookable | the slot is late (section 3.3) and `startAt - now <= 2 h` | 422 `SLOT_UNBOOKABLE` |
| 6 | BR-04 overlap | another slot of the same advisor with `deletedAt` null has `startAt < new.endAt` and `endAt > new.startAt` | 409 `SLOT_OVERLAP` |

Back-to-back slots (09:00-09:30 and 09:30-10:00) do not overlap.

### 3.3 Deadline and late-slot rule (shared with F-05, F-06, F-07)

These pure functions live in `server/src/domain/rules.ts`. They take `now` as a parameter (SDS section 2).

| Function | Result |
|---|---|
| `normalDeadline(startAt)` | If `local(startAt)` is before 12:00: 18:00 local on the previous calendar day. Otherwise `startAt - 2 h`. (BR-06) |
| `isLateSlot(startAt, now)` | `now >= normalDeadline(startAt)` (BR-16) |
| `bookingDeadline(slot)` | `slot.isLate ? slot.startAt - 2 h : normalDeadline(slot.startAt)` |

`isLate` is stored at creation, so the deadline of a slot never changes later (SDS section 3.1).

For an afternoon slot the normal deadline is already `startAt - 2 h`, so an afternoon slot created after it always starts 2 hours or less from now and is rejected by rule 5. In practice only morning slots can be late.

### 3.4 Failure and boundary cases

| Case | Result | Verified by |
|---|---|---|
| Valid start, body also has `endAt` | 201, `endAt = startAt + 30 min`, client `endAt` ignored | AC-F04-01 |
| Saturday 10:00 | 422 `SLOT_NOT_WEEKDAY` | AC-F04-02 |
| 10:15, or 10:00:30 | 422 `SLOT_INVALID_START_MINUTE` | AC-F04-02 |
| 07:30 (before 08:00) | 422 `SLOT_OUTSIDE_HOURS` | AC-F04-02 |
| 08:00 and 17:30 (first and last allowed) | 201 | AC-F04-02 |
| 18:00 (would end 18:30) | 422 `SLOT_OUTSIDE_HOURS` | AC-F04-02 |
| Start earlier today or yesterday | 422 `SLOT_IN_PAST` | AC-F04-03 |
| Overlaps own slot (09:00 exists, create 09:00) | 409 `SLOT_OVERLAP` | AC-F04-04 |
| Same time as another advisor's slot | 201 (overlap is per advisor) | AC-F04-04 |
| Morning slot created after its normal deadline, starting in more than 2 h | 201, `isLate: true` | AC-F04-06 |
| Late slot starting in exactly 2 h | 422 `SLOT_UNBOOKABLE`, no row | AC-F04-07 |
| Late slot starting in 2 h 01 min | 201, `isLate: true` | AC-F04-07 |
| Student calls the endpoint | 403 `FORBIDDEN_ROLE`, no row | AC-F04-05 |
| No session | 401 `UNAUTHENTICATED` | AC-R01-01 (shared) |
| Missing or invalid `startAt` | 400 `VALIDATION_ERROR` | AC-R02-01 (shared error shape) |

### 3.5 Permissions

| Caller | Allowed |
|---|---|
| Advisor | Yes. The slot always belongs to the logged-in advisor. |
| Student | No. 403 `FORBIDDEN_ROLE`. |
| No valid session | No. 401 `UNAUTHENTICATED`. |

Matches SDS section 6 ("Create, edit, delete slot": advisor only, own slots).

## 4. API contract

### 4.1 Request

`POST /api/slots`, JSON body, `sid` cookie required.

```json
{ "startAt": "2026-11-10T02:00:00.000Z" }
```

(09:00 on Tue 10 Nov 2026 in Asia/Bangkok.)

### 4.2 Success response

`201 Created`

```json
{
  "id": 7,
  "startAt": "2026-11-10T02:00:00.000Z",
  "endAt": "2026-11-10T02:30:00.000Z",
  "isLate": false,
  "bookingDeadline": "2026-11-09T11:00:00.000Z",
  "status": "Open",
  "student": null,
  "bookingId": null
}
```

The shape is the same as one item of `GET /api/slots/mine` (F-05 section 4.2). `bookingDeadline` is `bookingDeadline(slot)` from section 3.3, in UTC.

### 4.3 Error responses

Format (SDS section 5): `{ "error": { "code": "...", "message": "..." } }`.

| Status | `code` | `message` (readable text) | When |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | "A valid start time is required." | Section 3.1 fails. |
| 401 | `UNAUTHENTICATED` | "You are not logged in." | No valid session. |
| 403 | `FORBIDDEN_ROLE` | "Only advisors can create slots." | Caller is a student. |
| 409 | `SLOT_OVERLAP` | "This slot overlaps one of your slots." | Rule 6. |
| 422 | `SLOT_NOT_WEEKDAY` | "Slots can only be on Monday to Friday." | Rule 1. |
| 422 | `SLOT_INVALID_START_MINUTE` | "A slot must start on the hour or half hour." | Rule 2. |
| 422 | `SLOT_OUTSIDE_HOURS` | "Slots must be between 08:00 and 18:00." | Rule 3. |
| 422 | `SLOT_IN_PAST` | "This start time is in the past." | Rule 4. |
| 422 | `SLOT_UNBOOKABLE` | "This slot starts too soon to be booked." | Rule 5. |
| 500 | `INTERNAL_ERROR` | "Something went wrong." | Unexpected error. No stack trace or SQL error in the body. |

No new error codes. All of them exist in SDS section 5.

## 5. UI behavior

Screen `/schedule` (SDS section 4.1), role: advisor. The slot list on the same screen is F-05.

| Part | Behavior |
|---|---|
| Form | Date picker (weekdays only) and a start-time select with 08:00 to 17:30 in 30-minute steps. A Create button. |
| Client check | Date and time are required before sending. The server's answer is authoritative (SDS section 4.2). |
| Loading | While the request runs the button is disabled and shows a spinner. |
| Success | A short success message. The new slot appears in the list without a page reload. |
| Error | A Bootstrap alert shows the server's `message` (for example "This slot overlaps one of your slots."). The form keeps its values. |
| 401 | The client goes to `/login`. |

## 6. Data

| Layer | Change |
|---|---|
| New model | `Slot` (SDS section 3). |
| Existing | `User` gets the back-relation `slots`. |
| Migration | A Prisma migration (for example `prisma migrate dev --name add_slot`) creates `Slot`. The same migration file gets raw SQL for the extension and the two constraints below, because Prisma cannot express them. |
| Seed | When this PR lands, the seed (`server/prisma/seed.ts`, Issue #7) adds future demo slots for the two seeded advisors. Dates are computed from "now" (the next weekdays), and the seed skips a slot that already exists, so a second run adds no duplicates and does not hit `Slot_no_overlap`. |

Planned Prisma model:

```prisma
model Slot {
  id        Int       @id @default(autoincrement())
  advisorId Int
  advisor   User      @relation("AdvisorSlots", fields: [advisorId], references: [id], onDelete: Restrict)
  startAt   DateTime  @db.Timestamptz(3)
  endAt     DateTime  @db.Timestamptz(3)
  createdAt DateTime  @db.Timestamptz(3)
  isLate    Boolean
  deletedAt DateTime? @db.Timestamptz(3) // null unless deleted (Sprint 2, F-13)

  @@index([advisorId, startAt])
}

// in model User, add:
//   slots Slot[] @relation("AdvisorSlots")
```

`createdAt` has no database default: the service sets it from `now` so a faked clock stays consistent.

Raw SQL in the same migration (SDS section 3.1, identifiers quoted because Prisma uses camelCase columns):

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Slot" ADD CONSTRAINT "Slot_duration_check"
  CHECK ("endAt" = "startAt" + interval '30 minutes');

ALTER TABLE "Slot" ADD CONSTRAINT "Slot_no_overlap"
  EXCLUDE USING gist ("advisorId" WITH =, tstzrange("startAt", "endAt") WITH &&)
  WHERE ("deletedAt" IS NULL);
```

`tstzrange` is half-open (`[start, end)`), so back-to-back slots are allowed. An exclusion violation (SQLSTATE `23P01`) is mapped to 409 `SLOT_OVERLAP`. Prisma has no code for it, so it is expected as `PrismaClientUnknownRequestError` whose message contains `23P01` / `Slot_no_overlap`; a test confirms which error arrives so a race never becomes a 500.

## 7. Acceptance criteria

| AC | Criterion | Expected, observable outcome |
|---|---|---|
| AC-F04-01 | Advisor creates a slot from a start time; end is start + 30 min, and any client-sent end is ignored. | 201. Body has `endAt = startAt + 30 min` even when the request sent another `endAt`. One `Slot` row with `advisorId` = the logged-in advisor. |
| AC-F04-02 | Saturday/Sunday, a start not on :00/:30, a start before 08:00 or an end after 18:00 is rejected. | Each case of section 3.4 returns 422 with its code, and no row is created. 08:00 and 17:30 on a weekday return 201. |
| AC-F04-03 | A start time in the past is rejected. | 422 `SLOT_IN_PAST`, no row. |
| AC-F04-04 | A slot overlapping another of the advisor's own slots is rejected. | 409 `SLOT_OVERLAP`, still one row. A back-to-back slot and another advisor's slot at the same time are accepted. |
| AC-F04-05 | A student creating a slot gets 403. | 403 `FORBIDDEN_ROLE`, no row. |
| AC-F04-06 | A slot created at or after its normal BR-06 deadline, starting more than 2 hours from now, is accepted (late slot). | 201, `isLate: true`, `bookingDeadline = startAt - 2 h`. |
| AC-F04-07 | A late slot that starts 2 hours or less from now is rejected with 422 `SLOT_UNBOOKABLE` and no slot is stored. | At exactly 2 h: 422 `SLOT_UNBOOKABLE`, no row. At 2 h 01 min: 201 with `isLate: true`. |

## 8. Software Test Specification (STS)

Test files:
- `server/tests/slots.create.test.ts` (API, Supertest against the `_test` database)
- `server/tests/domain.rules.test.ts` (unit tests of the pure functions in `rules.ts`)

Test clock: as in F-01, `vi.useFakeTimers({ toFake: ['Date'] })` and `vi.setSystemTime(...)`. Unless a row says otherwise, "now" is **Mon 9 Nov 2026 10:00** Asia/Bangkok (`2026-11-09T03:00:00Z`). Times below are Asia/Bangkok.

| TEST | AC | Level | Precondition / input | Action | Expected |
|---|---|---|---|---|---|
| TEST-F04-01 | AC-F04-01 | API | Advisor logged in. | `POST /api/slots` with `startAt` = Tue 10 Nov 09:00 and `endAt` = Tue 10 Nov 12:00. | 201. `endAt` is 09:30. One `Slot` row, `advisorId` = the advisor's id, `isLate` false. |
| TEST-F04-02 | AC-F04-02 | Unit + API | Advisor logged in. | Unit: the BR-02 check with Sat 14 Nov 10:00, Sun 15 Nov 10:00, Tue 10:15, Tue 10:00:30, Tue 07:30, Tue 18:00, Tue 08:00, Tue 17:30. API: `POST` the same starts. | Codes as in section 3.4. 08:00 and 17:30 pass (unit) and return 201 (API). Rejected cases create no row. |
| TEST-F04-03 | AC-F04-03 | API | Advisor logged in. | `POST` with Mon 9 Nov 09:30 (earlier today) and Fri 6 Nov 10:00. | Both 422 `SLOT_IN_PAST`, no row. |
| TEST-F04-04 | AC-F04-04 | API | Advisor A has Tue 09:00. Advisor B logged in too. | A: `POST` Tue 09:00 again. A: `POST` Tue 09:30. B: `POST` Tue 09:00. | 409 `SLOT_OVERLAP` (A's row count stays 1), then 201, then 201. |
| TEST-F04-05 | AC-F04-05 | API | Student logged in. | `POST /api/slots` with a valid start. | 403 `FORBIDDEN_ROLE`, `Slot` count unchanged. |
| TEST-F04-06 | AC-F04-06 | Unit + API | Now = Mon 9 Nov 19:00. Advisor logged in. | Unit: `isLateSlot(Tue 09:00, now)` and `normalDeadline(Tue 09:00)`. API: `POST` Tue 10 Nov 09:00. | Unit: deadline Mon 18:00, late true. API: 201, `isLate` true, `bookingDeadline` = Tue 07:00. |
| TEST-F04-07 | AC-F04-07 | API | Advisor logged in. | Now = Tue 10 Nov 07:30: `POST` Tue 09:30. Then now = Tue 07:29: `POST` Tue 09:30. | First: 422 `SLOT_UNBOOKABLE`, no row. Second: 201, `isLate` true. |

UI/E2E: the Playwright journey (Issue #13) creates a slot on `/schedule` as an advisor. It adds no new TEST id to F-04.

### 8.1 TDD plan

The unit tests in `domain.rules.test.ts` for BR-02, BR-03 and BR-16 (TEST-F04-02 and TEST-F04-06, unit part) are written first and shown failing (no `rules.ts` yet). They need no login, so they can start before F-01 merges. Then the API tests TEST-F04-01 to -07 are written and shown failing, then the endpoint makes them pass. The failing runs are kept as evidence.

## 9. Known limitations (Sprint 1)

- No editing, deleting or batch creation of slots (F-12, F-13, F-15, Sprint 2).
- Creating a late slot sends no notification yet (FR-19, Sprint 3).
- Public holidays are not blocked (A-06).

## 10. Completion evidence

Recorded in the F-04 implementation PR and in Part F of the PDF: failing-then-passing test runs, `npm test` output with counts, PR link and reviewer, and the Issue link (#10). See `definition-of-done.md`.
