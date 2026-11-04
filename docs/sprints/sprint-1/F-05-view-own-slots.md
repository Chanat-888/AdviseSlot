# F-05 View own slots: Engineering Contract

| Item | Value |
|---|---|
| Feature | F-05 View own slots |
| Sprint | 1 |
| Owner | Jeerasak Phisawong (reviewer: Chanat Dachkhumhang) |
| Status | Contract draft. Implementation not started (Issue #10). |
| Linked requirements | FR-05, BR-08, BR-09, NFR-03 (see section 1) |
| Depends on | F-04 (slots exist); F-07 for the Booked status and student name |
| Needed by | F-09 (an advisor opens a booking from this list) |
| Related documents | `docs/srs.md` (v0.4), `docs/features.md`, `docs/traceability.md`, `docs/system-sds.md` sections 4.1, 4.2, 5, 6, `docs/decisions.md` (D-24), `docs/sprints/sprint-1/F-04-create-slot.md` |

## Version history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-04 | Jeerasak (drafted with an AI agent) | First contract, written before implementation. Awaiting team review. |

## 1. Linked requirements

| ID | Text (short) | How F-05 meets it |
|---|---|---|
| FR-05 | An advisor lists their own slots with status (Open, Booked, Closed, Passed) and, when Booked, the student's name. | `GET /api/slots/mine` (section 4). |
| BR-08 | Advisors maintain only their own slots. | The list is filtered by `advisorId` = the session user. |
| BR-09 | An advisor sees only bookings on their own slots. | Student names appear only for the advisor's own slots. |
| NFR-03 | A user calling an operation for another role gets 403. | A student gets 403 `FORBIDDEN_ROLE` (AC-F05-02). |
| Also relevant | D-24 (status vocabulary), SDS section 4.2 (status table) | Status is computed on the server (section 3.2). |

## 2. Behavior and workflow

1. The advisor opens `/schedule` (also the landing page after login, F-03).
2. The client calls `GET /api/slots/mine`.
3. `requireAuth`, then `requireRole("ADVISOR")`.
4. The server loads the advisor's slots with `deletedAt` null, each with its ACTIVE booking (if any) and that booking's student.
5. For each slot it computes the status (section 3.2) and the `bookingDeadline` (F-04 section 3.3) with the server's `now`.
6. The server responds 200 with the list sorted by `startAt` ascending.
7. The client shows the slots grouped by date. A Booked slot links to `/bookings/:bookingId` (F-09).

"Now" is the server clock in JavaScript, passed to the rule functions and queries, never the database `now()`.

Dependencies: F-04, and F-07 for bookings.

## 3. Validation, failures and boundaries

### 3.1 Input

No body. No query parameters in Sprint 1 (the date-range filter belongs to the summary, F-17). The only input is the `sid` cookie.

### 3.2 Slot status (D-24, SDS section 4.2)

A pure function `slotStatus(slot, hasActiveBooking, now)` in `server/src/domain/rules.ts`, checked in this order:

| # | Status | Condition |
|---|---|---|
| 1 | Passed | `slot.endAt <= now` |
| 2 | Booked | the slot has an ACTIVE booking |
| 3 | Closed | `now >= bookingDeadline(slot)` (no active booking, not ended) |
| 4 | Open | otherwise |

A slot that has started but not ended and is unbooked is Closed, because its deadline has passed.

### 3.3 Failure and boundary cases

| Case | Result | Verified by |
|---|---|---|
| Advisor with slots of every status | 200, each slot with the right status | AC-F05-01 |
| Booked slot | `student` is `{ id, name }` of the booking's student, `bookingId` is set | AC-F05-01 |
| Open, Closed or unbooked Passed slot | `student` and `bookingId` are `null` | AC-F05-01 |
| Passed slot that had an ACTIVE booking | Status Passed, `student` and `bookingId` still set (the advisor can see who came) | AC-F05-01 |
| Another advisor's slots | Never in the list | AC-F05-01 |
| Future unbooked slot past its deadline | Closed, not Open | AC-F05-03 |
| Same slot one second before its deadline | Open | AC-F05-03 |
| Advisor with no slots | 200 with `[]` | Empty state (section 5) |
| Student calls the endpoint | 403 `FORBIDDEN_ROLE` | AC-F05-02 |
| No session | 401 `UNAUTHENTICATED` | AC-R01-01 (shared) |

### 3.4 Permissions

| Caller | Allowed |
|---|---|
| Advisor | Yes. Only their own slots. |
| Student | No. 403 `FORBIDDEN_ROLE`. |
| No valid session | No. 401 `UNAUTHENTICATED`. |

Matches SDS section 6 ("View own slots with student names": advisor only, own slots).

## 4. API contract

### 4.1 Request

`GET /api/slots/mine`, no body, `sid` cookie required.

### 4.2 Success response

`200 OK`, an array sorted by `startAt` ascending.

```json
[
  {
    "id": 7,
    "startAt": "2026-11-10T02:00:00.000Z",
    "endAt": "2026-11-10T02:30:00.000Z",
    "isLate": false,
    "bookingDeadline": "2026-11-09T11:00:00.000Z",
    "status": "Booked",
    "student": { "id": 3, "name": "Example Student" },
    "bookingId": 12
  },
  {
    "id": 8,
    "startAt": "2026-11-10T02:30:00.000Z",
    "endAt": "2026-11-10T03:00:00.000Z",
    "isLate": false,
    "bookingDeadline": "2026-11-09T11:00:00.000Z",
    "status": "Open",
    "student": null,
    "bookingId": null
  }
]
```

| Field | Type | Notes |
|---|---|---|
| `id` | integer | `Slot.id` |
| `startAt`, `endAt` | ISO 8601 UTC string | |
| `isLate` | boolean | `Slot.isLate` |
| `bookingDeadline` | ISO 8601 UTC string | F-04 section 3.3 |
| `status` | `"Open"`, `"Booked"`, `"Closed"` or `"Passed"` | Section 3.2 |
| `student` | `{ id, name }` or `null` | The student of the ACTIVE booking. Never an email or other user data. |
| `bookingId` | integer or `null` | The ACTIVE booking's id, for the link to F-09 |

(Example values are placeholders.) One item has the same shape as the F-04 response.

### 4.3 Error responses

| Status | `code` | `message` | When |
|---|---|---|---|
| 401 | `UNAUTHENTICATED` | "You are not logged in." | No valid session. |
| 403 | `FORBIDDEN_ROLE` | "Only advisors can view their schedule." | Caller is a student. |
| 500 | `INTERNAL_ERROR` | "Something went wrong." | Unexpected error. No stack trace in the body. |

Format: SDS section 5. No new codes.

## 5. UI behavior

Screen `/schedule`, role: advisor (the create form on the same screen is F-04).

| Part | Behavior |
|---|---|
| List | Slots grouped by date (for example "Tue 10 Nov 2026"), each row showing time (`09:00-09:30`), a status badge, and the student's name when Booked. A late slot shows a small "Late slot" label. |
| Status badges | Open, Booked, Closed, Passed, using the D-24 words exactly. |
| Link | A Booked (or Passed with a student) row links to `/bookings/:bookingId` (F-09). |
| Loading | A spinner while the request runs. |
| Empty | "You have no slots yet. Create one above." |
| Error | A Bootstrap alert with the server's `message`. A 401 sends the user to `/login`. |
| Refresh | The list reloads after a slot is created (F-04). |

## 6. Data

| Layer | Change |
|---|---|
| Database | No schema change. Reads `Slot` (F-04), `Booking` (F-07) and `User`. |
| Migration | None. |
| Query | One query for the advisor's slots with `deletedAt` null, including the ACTIVE booking and its student's `id` and `name` only (no N+1 queries). |

Until F-07 merges there are no bookings, so every slot is Open, Closed or Passed. The Booked case is tested once `Booking` exists (TEST-F05-01 creates the booking row directly with Prisma).

## 7. Acceptance criteria

| AC | Criterion | Expected, observable outcome |
|---|---|---|
| AC-F05-01 | Advisor sees only their own slots, each with a D-24 status (Open, Booked, Closed, Passed) and the student's name when Booked. | 200. The list has exactly the advisor's slots, sorted by `startAt`, each with the status of section 3.2. The Booked slot has `student` = `{ id, name }` of its student and a `bookingId`. Unbooked slots have `student: null`. No other advisor's slot appears. |
| AC-F05-02 | A student requesting the advisor slot list gets 403. | 403 `FORBIDDEN_ROLE` and no slot data. |
| AC-F05-03 | An unbooked future slot whose booking deadline has passed shows as Closed, not Open. | A morning slot for Tue 09:00 is Open at Mon 17:59:59 and Closed at Mon 18:00:00 (Asia/Bangkok). |

## 8. Software Test Specification (STS)

Test files:
- `server/tests/slots.mine.test.ts` (API, Supertest against the `_test` database)
- `server/tests/domain.rules.test.ts` (unit tests of `slotStatus`)

Test clock: fake `Date` as in F-01. Times are Asia/Bangkok. Rows are inserted with Prisma so any status can be set up directly.

| TEST | AC | Level | Precondition / input | Action | Expected |
|---|---|---|---|---|---|
| TEST-F05-01 | AC-F05-01 | API | Now = Mon 9 Nov 10:00. Advisor A has: Tue 09:00 with an ACTIVE booking by student S (Booked), Tue 09:30 (Open), Mon 9 Nov 11:00 unbooked (Closed, see note), Fri 6 Nov 10:00 (Passed). Advisor B has Tue 09:00. | A calls `GET /api/slots/mine`. | 200. Exactly A's 4 slots, sorted by `startAt`, with statuses Passed, Closed, Booked, Open in time order. The Booked item has `student` = `{ id: S.id, name: S.name }` and `bookingId`. Others have `student: null`. B's slot is absent. No item has an email. |
| TEST-F05-02 | AC-F05-02 | API | Student logged in. | `GET /api/slots/mine`. | 403 `FORBIDDEN_ROLE`, error shape only. |
| TEST-F05-03 | AC-F05-03 | Unit + API | Advisor A has an unbooked Tue 10 Nov 09:00 slot (`isLate` false, deadline Mon 18:00). | Unit: `slotStatus` at Mon 17:59:59 and Mon 18:00:00. API: `GET /api/slots/mine` at the same two times. | 17:59:59: Open. 18:00:00: Closed. |

Note on TEST-F05-01: Mon 9 Nov 11:00 is a morning slot, so its normal deadline was Sun 8 Nov 18:00. At now = Mon 10:00 it is not ended, unbooked and past its deadline, so it is Closed.

UI/E2E: the Playwright journey (Issue #13) checks that after the student books, the advisor's `/schedule` shows the student's name. It adds no new TEST id to F-05.

### 8.1 TDD plan

The `slotStatus` unit tests (TEST-F05-03 unit part) are written first and shown failing, then TEST-F05-01 to -03 at API level, then the endpoint. The failing runs are kept as evidence.

## 9. Known limitations (Sprint 1)

- No date filter and no paging. With Sprint 1 data volumes the full list is fine. The NFR-10 performance target (Sprint 3) is about the bookable list, not this one.
- Deleted slots (Sprint 2) will be hidden by `deletedAt`. There is nothing to delete in Sprint 1.

## 10. Completion evidence

Failing-then-passing runs, `npm test` output with counts, PR link and reviewer, Issue link (#10). See `definition-of-done.md`.
