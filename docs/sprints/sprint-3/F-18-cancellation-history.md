# F-18 Cancellation history: Engineering Contract

| Item | Value |
|---|---|
| Feature | F-18 Cancellation history |
| Sprint | 3 |
| Owner | Contract and implementation: Chanat Dachkhumhang (Issue: Sprint 3 contracts F-18, F-19), reviewed by Jeerasak Phisawong. |
| Status | Implemented (TEST-F18-01 to -06 pass). Awaiting review. |
| Linked requirements | FR-18, BR-09, NFR-03 (see section 1) |
| Scope | Student side: already delivered by F-08 + F-10/F-11 (`GET /api/bookings/mine` lists Cancelled bookings with the `cancellation` object); F-18 only adds the "Cancelled by you" label. Advisor side: new `GET /api/bookings/history` and `/history` page. |
| Depends on | F-08, F-10, F-11 (cancel columns and the `cancellation` object, PR #76), F-13 (soft delete keeps history, D-29, PR #77), F-14 (a reschedule appears as a student cancel) |
| Needed by | none |
| Related documents | `docs/srs.md` (v0.5), `docs/system-sds.md` sections 4.1, 5.1, 6, `docs/decisions.md` (D-24, D-29), `docs/sprints/sprint-2/F-10-student-cancel.md` section 4.2, `docs/sprints/sprint-2/F-11-advisor-cancel.md`, `docs/sprints/sprint-2/F-14-reschedule.md` section 6 |

## Version history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-22 | Chanat (drafted with an AI agent) | First contract, written before implementation, on the Sprint 2 contracts in PR #76 and #77. Awaiting team review. |
| 0.2 | 2026-11-23 | Chanat (drafted with an AI agent) | Rebased on the released Sprint 2 (`v0.2.0-sprint-2`). F-10 already lists the student's Cancelled bookings on `/bookings` from `GET /api/bookings/mine`, so the endpoint is now advisor-only (a student gets 403) and the student side only adds the "Cancelled by you" label (AC-F18-06). AC-F18-01 now checks the existing student path. SRS reference v0.5. |
| 0.3 | 2026-11-26 | Chanat (drafted with an AI agent) | Status line after implementation. Section 8.1: the red run of TEST-F18-02 to -05 fails on a 400, not a 404, because `GET /api/bookings/history` without the route is caught by `GET /api/bookings/:id` and `parseId("history")` refuses it. |

## 1. Linked requirements

| ID | Text (short) | How F-18 meets it |
|---|---|---|
| FR-18 | A student and an advisor see cancelled bookings in their history with who cancelled and the reason. | Student: `GET /api/bookings/mine` (F-08, extended by F-10) already returns Cancelled bookings with the `cancellation` object; `/bookings` shows them under "Cancelled" with "Cancelled by you" (new) or "Cancelled by <advisor>: <reason>" (F-11). Advisor: new `GET /api/bookings/history` (SDS 5.1) returns Cancelled and Passed bookings on the advisor's own slots, with the same `cancellation` object; screen `/history`. |
| BR-09 | A student sees only their own bookings; an advisor only bookings on their own slots. | The query is scoped by the session user: `studentId` = caller, or `slot.advisorId` = caller. No id parameter, so there is nothing to guess. |
| NFR-03 | Server-side role checks. | `GET /api/bookings/history` is ADVISOR only (`requireRole`); a student gets 403 `FORBIDDEN_ROLE` and uses `/mine` instead. |

## 2. Behavior and workflow

Student (no server change):

1. `/bookings` calls `GET /api/bookings/mine` as in Sprint 2. Cancelled items carry `cancellation` (F-10 section 4.2).
2. New in F-18: a Cancelled row whose `cancellation.cancelledBy.role` is "STUDENT" shows "Cancelled by you". Rows cancelled by the advisor keep the F-11 text "Cancelled by <advisor name>: <reason>".

Advisor:

1. The advisor opens `/history` from the top bar ("History").
2. The client sends `GET /api/bookings/history`.
3. `requireAuth`, then `requireRole("ADVISOR")`.
4. The query returns bookings whose slot has `advisorId` = caller and that are no longer Upcoming: display status "Cancelled" (`status` CANCELLED) or "Passed" (ACTIVE and slot ended), by `bookingStatus` from Sprint 1 (D-24).
5. Bookings on soft-deleted slots are included (D-29: deletion keeps history). They show the slot's time as it was.
6. Sorted by slot start, newest first; ties by booking id descending.
7. 200 with the list (section 4.2).

"Now" is the server clock, passed in.

## 3. Validation, failures and boundaries

### 3.1 Input validation

No body, no query parameters. Unknown query parameters are ignored.

### 3.2 Failure and boundary cases

| Case | Result | Verified by |
|---|---|---|
| Student `/mine` with one cancelled (by self), one cancelled by advisor, one passed, one upcoming | 200, four items; the two Cancelled ones carry `cancellation` (self: `role` "STUDENT", `reason` null; advisor: `role` "ADVISOR", "Sick leave"); Passed and Upcoming have no `cancellation` key | AC-F18-01 |
| Advisor history with a booking cancelled by the student and one cancelled by the advisor with "Sick leave" | Both listed with the matching `cancellation` | AC-F18-02 |
| Advisor A: bookings on A's slots by two students, and a booking on B's slot | Only the two on A's slots, each with `student` | AC-F18-02 |
| Advisor B, bookings only on A's slots | `[]` for B | AC-F18-03 |
| Student calls `GET /api/bookings/history` | 403 `FORBIDDEN_ROLE` | AC-F18-03 |
| Cancelled booking on a slot the advisor later deleted (F-13) | Still listed in the advisor's history (and in the student's `/mine`, as in Sprint 2) | AC-F18-04 |
| Rescheduled booking (F-14) | Advisor's history lists the old booking as cancelled by the student, reason null | AC-F18-04 |
| ACTIVE booking whose slot ends at 10:30: now 10:29:59 / 10:30:00 | Not listed / listed as "Passed" | AC-F18-05 |
| Advisor with no past or cancelled bookings | 200, `[]` | AC-F18-05 |
| No session | 401 | AC-R01-01 (shared) |

### 3.3 Permissions

| Caller | Allowed | Scope |
|---|---|---|
| Student | No. 403 `FORBIDDEN_ROLE` (uses `/mine`). | |
| Advisor | Yes | Bookings on own slots only |
| No session | No. 401. | |

## 4. API contract

### 4.1 Request

`GET /api/bookings/history`, no body, `sid` cookie of an ADVISOR required.

### 4.2 Success response

`200 OK`, an array of items in the F-09 detail shape (with `cancellation` for Cancelled items, F-10 section 4.2):

```json
[
  {
    "id": 14,
    "status": "Cancelled",
    "createdAt": "2026-11-09T03:00:00.000Z",
    "slot": { "id": 9, "startAt": "2026-11-12T03:00:00.000Z", "endAt": "2026-11-12T03:30:00.000Z" },
    "advisor": { "id": 1, "name": "Example Advisor" },
    "student": { "id": 3, "name": "Example Student" },
    "cancellation": {
      "cancelledAt": "2026-11-10T01:00:00.000Z",
      "cancelledBy": { "id": 1, "name": "Example Advisor", "role": "ADVISOR" },
      "reason": "Sick leave"
    }
  },
  {
    "id": 11,
    "status": "Passed",
    "createdAt": "2026-11-02T03:00:00.000Z",
    "slot": { "id": 4, "startAt": "2026-11-06T03:00:00.000Z", "endAt": "2026-11-06T03:30:00.000Z" },
    "advisor": { "id": 1, "name": "Example Advisor" },
    "student": { "id": 3, "name": "Example Student" }
  }
]
```

`student` is included so the advisor sees who booked. No email or other user data (as F-09).

### 4.3 Error responses

| Status | `code` | `message` | When |
|---|---|---|---|
| 401 | `UNAUTHENTICATED` | "You are not logged in." | No session. |
| 403 | `FORBIDDEN_ROLE` | "Only advisors have a booking history." | Caller is a STUDENT. |
| 500 | `INTERNAL_ERROR` | "Something went wrong." | Unexpected. |

No new codes (`FORBIDDEN_ROLE` exists since Sprint 1).

## 5. UI behavior

| Screen | Behavior |
|---|---|
| `/bookings` (student) | Unchanged data source (`/mine`). New: a row cancelled by the student shows "Cancelled by you"; a row cancelled by the advisor keeps "Cancelled by <advisor name>: <reason>" (F-11). |
| `/history` (advisor, new) | One table, newest first: date and time, student name, status badge, and for Cancelled "Cancelled by <student name>" or "Cancelled by you: <reason>". Link to `/bookings/:id`. Top-bar link "History". |
| Empty | "No cancelled or past bookings yet." |
| Loading / error | As SDS section 4.2. |

## 6. Data

No schema change: uses F-10's `cancelledAt`, `cancelledById`, `cancelReason`. Index `Booking(studentId)` exists; the advisor query joins `Slot` on `advisorId` (index `Slot(advisorId, startAt)` exists).

## 7. Acceptance criteria

| AC | Criterion | Expected, observable outcome |
|---|---|---|
| AC-F18-01 | A student sees their cancelled bookings with who cancelled and the reason (existing `/mine`, F-08 + F-10/F-11). | `/mine` returns the cancelled-by-self item with `role` "STUDENT", `reason` null, and the cancelled-by-advisor item with `role` "ADVISOR" and the reason; Passed and Upcoming have no `cancellation` key. |
| AC-F18-02 | An advisor's history lists cancelled and passed bookings on their own slots only, with the student's name and the `cancellation` object, newest first; Upcoming is not listed. | Advisor A gets the bookings on A's slots (both students named), not the booking on B's slot, not A's Upcoming booking. |
| AC-F18-03 | BR-09 and NFR-03: no one sees another user's history. | Advisor B's history has none of A's bookings. A student calling `/history` gets 403 `FORBIDDEN_ROLE`. |
| AC-F18-04 | Deleted slots and reschedules keep their history. | A cancelled booking on a later-deleted slot is listed in the advisor's history. A rescheduled booking's old row is listed as cancelled by the student. |
| AC-F18-05 | Passed boundary and empty list. | Slot ending 10:30: not in A's history at 10:29:59, listed "Passed" at 10:30:00. An advisor with no such bookings gets `[]`. |
| AC-F18-06 | The student's `/bookings` shows who cancelled. | A row cancelled by the student shows "Cancelled by you"; a row cancelled by the advisor shows "Cancelled by <advisor name>: <reason>". |

## 8. Software Test Specification (STS)

Test file: `server/tests/bookings.history.test.ts` (API, Supertest, `_test` database). Rows are inserted with Prisma (including CANCELLED rows with `cancelledById` and `cancelReason`) so no Sprint 2 endpoint is needed in the setup. Fake clock, Asia/Bangkok, now = Mon 9 Nov 10:00 unless stated.

| TEST | AC | Level | Precondition / input | Action | Expected |
|---|---|---|---|---|---|
| TEST-F18-01 | AC-F18-01 | API | S1: booking on Thu 12 Nov cancelled by S1; booking on Wed 11 Nov cancelled by advisor A with "Sick leave"; ACTIVE booking on Fri 6 Nov (ended); ACTIVE booking on Fri 13 Nov. | S1: `GET /api/bookings/mine`. | 4 items; cancellation fields as AC-F18-01. Regression check of the Sprint 2 path (expected to pass before any F-18 code). |
| TEST-F18-02 | AC-F18-02 | API | A's slots: S1 cancelled by S1 (Thu), S2 cancelled by A with "Sick leave" (Wed), S2 passed (Fri 6), S3 ACTIVE upcoming (Fri 13). B's slot: S3 cancelled. | A: `GET /api/bookings/history`. | 3 items in order Thu, Wed, Fri 6, with `student` and `cancellation` as stored; S3's upcoming and B's booking absent. |
| TEST-F18-03 | AC-F18-03 | API | State of TEST-F18-02. B and S1 logged in. | B: `GET`; S1: `GET`. | B: only S3's cancelled booking on B's slot. S1: 403 `FORBIDDEN_ROLE`. |
| TEST-F18-04 | AC-F18-04 | API | A's slot Thu 12 Nov 10:00: S1's booking CANCELLED, then the slot soft-deleted (`deletedAt` set). S2 on A's slots: an old CANCELLED booking (cancelled by S2, reason null) and a new ACTIVE booking (a reschedule pair). | A: `GET`. | Lists the deleted slot's booking and S2's old booking cancelled by S2; not S2's new ACTIVE booking. |
| TEST-F18-05 | AC-F18-05 | API | S1: ACTIVE booking on A's slot Mon 9 Nov 10:00 to 10:30. Advisor B: no bookings. | A `GET` at 10:29:59 and at 10:30:00; B `GET`. | Not listed; listed "Passed"; B `[]`. |
| TEST-F18-06 | AC-F18-06 | E2E | Student has two bookings; the advisor cancels one with a reason (F-11). | Student cancels the other, opens `/bookings`. | "Cancelled by you" on one row, "Cancelled by <advisor>: <reason>" on the other. |

R-01: `r01.auth.test.ts` adds `GET /api/bookings/history` to the 401 list.

UI/E2E: TEST-F18-06 in `e2e/tests/journey.spec.ts`, plus the advisor opening `/history` and seeing the cancelled row with the student's name.

### 8.1 TDD plan

TEST-F18-02 to -05 first, red (route missing: the asserted 200/403 fails on the 400 of `GET /api/bookings/:id`, not a compile error), then the endpoint. TEST-F18-06 red on the missing "Cancelled by you" text, then the label. TEST-F18-01 checks the existing Sprint 2 path and is expected green from the start; it is not TDD evidence.

## 9. Known limitations

- No paging. With the course data size (a few hundred bookings) one list is fine; paging is debt if the data grows.
- No link between a rescheduled booking and its new booking (F-14 section 6); the old one reads "Cancelled by you".

## 10. Completion evidence

Failing-then-passing runs, `npm test` output with counts, PR link and reviewer, Issue link.
