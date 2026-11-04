# F-08 View own bookings: Engineering Contract

| Item | Value |
|---|---|
| Feature | F-08 View own bookings |
| Sprint | 1 |
| Owner | Jeerasak Phisawong (reviewer: Chanat Dachkhumhang) |
| Status | Contract draft. Implementation not started (Issue #12). |
| Linked requirements | FR-08, BR-07, BR-09 (see section 1) |
| Depends on | F-07 (bookings exist) |
| Needed by | F-09 (the student opens a booking from this list) |
| Related documents | `docs/srs.md` (v0.4), `docs/features.md`, `docs/traceability.md`, `docs/system-sds.md` sections 4.1, 4.2, 5, 6, `docs/decisions.md` (D-17, D-24, D-27), `docs/sprints/sprint-1/F-07-book-slot.md` |

## Version history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-04 | Jeerasak (drafted with an AI agent) | First contract, written before implementation. Awaiting team review. |

## 1. Linked requirements

| ID | Text (short) | How F-08 meets it |
|---|---|---|
| FR-08 | A student lists their own bookings (upcoming and past) and opens one booking's detail. | The list is `GET /api/bookings/mine` (section 4). Opening one is F-09. |
| BR-07 | An active booking whose slot has ended no longer counts and is shown as "Passed". | Display status computed on the server (section 3.2). |
| BR-09 | A student sees only their own bookings. | Filtered by `studentId` = the session user. No parameter can change it. |
| Also relevant | D-24 (booking statuses Upcoming, Passed, Cancelled), NFR-03 (wrong role gives 403) | An advisor gets 403 `FORBIDDEN_ROLE`. |

## 2. Behavior and workflow

1. The student opens `/bookings` (top bar link).
2. The client calls `GET /api/bookings/mine`.
3. `requireAuth`, then `requireRole("STUDENT")`.
4. The server loads the bookings with `studentId` = the session user, each with its slot and the slot's advisor.
5. For each it computes the display status (section 3.2) with the server's `now`.
6. The server responds 200: Upcoming bookings first by `startAt` ascending, then Passed and Cancelled by `startAt` descending (most recent first).
7. The client shows them in sections. Each row links to `/bookings/:id` (F-09).

"Now" is the server clock in JavaScript.

Dependencies: F-07.

## 3. Validation, failures and boundaries

### 3.1 Input

No body, no parameters. The only input is the `sid` cookie.

### 3.2 Booking display status (D-24, SDS section 4.2)

A pure function `bookingStatus(booking, slot, now)` in `server/src/domain/rules.ts`:

| Status | Condition |
|---|---|
| Cancelled | `booking.status = CANCELLED` (cannot happen until Sprint 2 cancel, but the function handles it) |
| Passed | `booking.status = ACTIVE` and `slot.endAt <= now` |
| Upcoming | `booking.status = ACTIVE` and `slot.endAt > now` |

A booking whose slot has started but not ended is still Upcoming, matching the BR-07 definition of "active".

### 3.3 Failure and boundary cases

| Case | Result | Verified by |
|---|---|---|
| Student with an upcoming and a past booking | Both listed, statuses Upcoming and Passed | AC-F08-01 |
| ACTIVE booking, slot ends at 10:30, now 10:29:59 / 10:30:00 | Upcoming / Passed | AC-F08-01 |
| Another student's bookings | Never in the list | AC-F08-01 |
| Student with no bookings | 200 with `[]` | Empty state (section 5) |
| Advisor calls the endpoint | 403 `FORBIDDEN_ROLE` | Section 3.4 (NFR-03 pattern, covered by TEST-F08-01 step 3) |
| No session | 401 `UNAUTHENTICATED` | AC-R01-01 (shared) |

### 3.4 Permissions

| Caller | Allowed |
|---|---|
| Student | Yes. Own bookings only. |
| Advisor | No. 403 `FORBIDDEN_ROLE` (advisors see bookings through F-05 and F-09). |
| No valid session | No. 401 `UNAUTHENTICATED`. |

Matches SDS section 6 ("List own bookings": student only).

## 4. API contract

### 4.1 Request

`GET /api/bookings/mine`, no body, `sid` cookie required.

### 4.2 Success response

`200 OK`

```json
[
  {
    "id": 12,
    "status": "Upcoming",
    "createdAt": "2026-11-09T03:00:00.000Z",
    "slot": {
      "id": 8,
      "startAt": "2026-11-10T02:30:00.000Z",
      "endAt": "2026-11-10T03:00:00.000Z"
    },
    "advisor": { "id": 1, "name": "Example Advisor" }
  }
]
```

| Field | Type | Notes |
|---|---|---|
| `id` | integer | `Booking.id`, used for `/bookings/:id` |
| `status` | `"Upcoming"`, `"Passed"` or `"Cancelled"` | Section 3.2 |
| `createdAt` | ISO 8601 UTC string | When it was booked |
| `slot` | `{ id, startAt, endAt }` | |
| `advisor` | `{ id, name }` | No email |

The list item is the F-09 detail without the `student` field (the student is the caller). (Example values are placeholders.)

### 4.3 Error responses

| Status | `code` | `message` | When |
|---|---|---|---|
| 401 | `UNAUTHENTICATED` | "You are not logged in." | No valid session. |
| 403 | `FORBIDDEN_ROLE` | "Only students have a booking list." | Caller is an advisor. |
| 500 | `INTERNAL_ERROR` | "Something went wrong." | Unexpected error. |

Format: SDS section 5. No new codes.

## 5. UI behavior

Screen `/bookings` (SDS section 4.1), role: student.

| Part | Behavior |
|---|---|
| Sections | "Upcoming" and "Passed" (a "Cancelled" section appears once Sprint 2 cancel exists). Each row: advisor name, time in the SDS format, status badge, link to `/bookings/:id`. |
| Loading | A spinner while the request runs. |
| Empty | "You have no bookings yet." with a link to `/slots`. |
| Error | A Bootstrap alert with the server's `message`. A 401 sends the user to `/login`. |

D-27 cut line: if the Sprint 1 release is at risk, this screen is cut before the API, rules or tests, and the cut is disclosed in the release notes and Part F.

## 6. Data

| Layer | Change |
|---|---|
| Database | No schema change. Reads `Booking` (F-07), `Slot` (F-04) and `User` (advisor name). |
| Migration | None. |
| Query | One query with the slot and advisor included (no N+1). Uses the `Booking.studentId` index from F-07. |

## 7. Acceptance criteria

| AC | Criterion | Expected, observable outcome |
|---|---|---|
| AC-F08-01 | Student sees only their own bookings, upcoming and past; an ended ACTIVE booking shows as "Passed". | 200. Exactly the student's bookings, Upcoming first. A booking on a slot that has ended has `status` "Passed"; one on a future slot has "Upcoming". Another student's bookings never appear. |

## 8. Software Test Specification (STS)

Test files:
- `server/tests/bookings.mine.test.ts` (API, Supertest against the `_test` database)
- `server/tests/domain.rules.test.ts` (unit tests of `bookingStatus`)

Test clock: fake `Date` as in F-01. Times are Asia/Bangkok. Rows are inserted with Prisma.

| TEST | AC | Level | Precondition / input | Action | Expected |
|---|---|---|---|---|---|
| TEST-F08-01 | AC-F08-01 | Unit + API | Now = Mon 9 Nov 10:00. S1 has an ACTIVE booking on Tue 10 Nov 09:00 and an ACTIVE booking on Fri 6 Nov 10:00 (ended). S2 has an ACTIVE booking on Tue 10 Nov 10:00. | Unit: `bookingStatus` for a slot ending 10:30 at 10:29:59 and at 10:30:00. API: 1. S1 calls `GET /api/bookings/mine`. 2. S2 calls it. 3. An advisor calls it. | Unit: Upcoming, then Passed. API: 1. 200, two items: Tue booking "Upcoming" first, Fri booking "Passed" second, each with `advisor.name`. 2. Only S2's booking. 3. 403 `FORBIDDEN_ROLE`. |

UI/E2E: the Playwright journey (Issue #13) opens the booking after booking it. It adds no new TEST id to F-08.

### 8.1 TDD plan

The `bookingStatus` unit tests and TEST-F08-01 are written first and shown failing, then the endpoint makes them pass. The failing run is kept as evidence.

## 9. Known limitations (Sprint 1)

- No Cancelled bookings exist until Sprint 2 (F-10, F-11). Cancel history with reasons is F-18 (Sprint 3).
- No paging.
- The `/bookings` screen may be cut under D-27 (section 5).

## 10. Completion evidence

Failing-then-passing run, `npm test` output with counts, PR link and reviewer, Issue link (#12). See `definition-of-done.md`.
