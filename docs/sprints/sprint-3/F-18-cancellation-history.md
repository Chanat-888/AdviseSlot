# F-18 Cancellation history: Engineering Contract

| Item | Value |
|---|---|
| Feature | F-18 Cancellation history |
| Sprint | 3 |
| Owner | Contract and implementation: Chanat Dachkhumhang (Issue: Sprint 3 contracts F-18, F-19), reviewed by Jeerasak Phisawong. |
| Status | Contract draft. Implementation not started. |
| Linked requirements | FR-18, BR-09, NFR-03 (see section 1) |
| Depends on | F-08, F-10, F-11 (cancel columns and the `cancellation` object, PR #76), F-13 (soft delete keeps history, D-29, PR #77), F-14 (a reschedule appears as a student cancel) |
| Needed by | none |
| Related documents | `docs/srs.md` (v0.4), `docs/system-sds.md` sections 4.1, 5.1, 6, `docs/decisions.md` (D-24, D-29), `docs/sprints/sprint-2/F-10-student-cancel.md` section 4.2, `docs/sprints/sprint-2/F-11-advisor-cancel.md`, `docs/sprints/sprint-2/F-14-reschedule.md` section 6 |

## Version history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-22 | Chanat (drafted with an AI agent) | First contract, written before implementation, on the Sprint 2 contracts in PR #76 and #77. Awaiting team review. |

## 1. Linked requirements

| ID | Text (short) | How F-18 meets it |
|---|---|---|
| FR-18 | A student and an advisor see cancelled bookings in their history with who cancelled and the reason. | `GET /api/bookings/history` (SDS 5.1) returns the caller's Cancelled and Passed bookings, each Cancelled one with the F-10 `cancellation` object (who, role, when, reason). Screens: student `/bookings` (Cancelled section), advisor `/history`. |
| BR-09 | A student sees only their own bookings; an advisor only bookings on their own slots. | The query is scoped by the session user: `studentId` = caller, or `slot.advisorId` = caller. No id parameter, so there is nothing to guess. |
| NFR-03 | Server-side role checks. | Both roles allowed, each with its own scope (SDS section 6, "Booking history"). |

## 2. Behavior and workflow

1. Student: on `/bookings` the "Cancelled" and "Passed" sections are filled from `GET /api/bookings/history`. Advisor: opens `/history` from the top bar.
2. The client sends `GET /api/bookings/history`.
3. `requireAuth`. No role restriction; the role picks the scope:
   - STUDENT: bookings with `studentId` = caller.
   - ADVISOR: bookings whose slot has `advisorId` = caller.
4. Only bookings that are no longer Upcoming are returned: display status "Cancelled" (`status` CANCELLED) or "Passed" (ACTIVE and slot ended), by `bookingStatus` from Sprint 1 (D-24).
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
| Student with one cancelled (by self), one cancelled by advisor, one passed, one upcoming | 200, three items; the upcoming one is not listed | AC-F18-01 |
| Advisor cancelled with reason "Sick leave" | Item has `cancellation.cancelledBy.role` "ADVISOR", `reason` "Sick leave" | AC-F18-01 |
| Student cancelled | `cancellation.cancelledBy.role` "STUDENT", `reason` null | AC-F18-01 |
| Passed booking | No `cancellation` key (as F-10 section 4.2) | AC-F18-01 |
| Advisor A: bookings on A's slots by two students, and a booking on B's slot | Only the two on A's slots, each with `student` | AC-F18-02 |
| Another student's history | Never returned: S2 sees none of S1's bookings | AC-F18-03 |
| Cancelled booking on a slot the advisor later deleted (F-13) | Still listed for both student and advisor | AC-F18-04 |
| Rescheduled booking (F-14) | Old booking listed as cancelled by the student, reason null | AC-F18-04 |
| ACTIVE booking whose slot ends at 10:30: now 10:29:59 / 10:30:00 | Not listed / listed as "Passed" | AC-F18-05 |
| Nothing in history | 200, `[]` | AC-F18-05 |
| No session | 401 | AC-R01-01 (shared) |

### 3.3 Permissions

| Caller | Allowed | Scope |
|---|---|---|
| Student | Yes | Own bookings only |
| Advisor | Yes | Bookings on own slots only |
| No session | No. 401. | |

## 4. API contract

### 4.1 Request

`GET /api/bookings/history`, no body, `sid` cookie required.

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

`student` is included for both roles (for a student it is themselves), so one shape serves both screens. No email or other user data (as F-09).

### 4.3 Error responses

| Status | `code` | `message` | When |
|---|---|---|---|
| 401 | `UNAUTHENTICATED` | "You are not logged in." | No session. |
| 500 | `INTERNAL_ERROR` | "Something went wrong." | Unexpected. |

No new codes. There is no 403: both roles may call it.

## 5. UI behavior

| Screen | Behavior |
|---|---|
| `/bookings` (student) | "Upcoming" from F-08 as before. "Cancelled" and "Passed" sections from this endpoint. A Cancelled row shows "Cancelled by you" or "Cancelled by <advisor name>: <reason>". |
| `/history` (advisor, new) | One table, newest first: date and time, student name, status badge, and for Cancelled "Cancelled by <student name>" or "Cancelled by you: <reason>". Link to `/bookings/:id`. Top-bar link "History". |
| Empty | "No cancelled or past bookings yet." |
| Loading / error | As SDS section 4.2. |

## 6. Data

No schema change: uses F-10's `cancelledAt`, `cancelledById`, `cancelReason`. Index `Booking(studentId)` exists; the advisor query joins `Slot` on `advisorId` (index `Slot(advisorId, startAt)` exists).

## 7. Acceptance criteria

| AC | Criterion | Expected, observable outcome |
|---|---|---|
| AC-F18-01 | A student's history lists their cancelled and passed bookings with who cancelled and the reason; Upcoming is not listed. | 200 with exactly the cancelled-by-self, cancelled-by-advisor and passed bookings, newest first. Student cancel: `role` "STUDENT", `reason` null. Advisor cancel: `role` "ADVISOR", the reason. Passed: no `cancellation` key. |
| AC-F18-02 | An advisor's history lists cancelled and passed bookings on their own slots only, with the student's name. | Advisor A gets the bookings on A's slots (both students named), not the booking on B's slot. |
| AC-F18-03 | BR-09: no one sees another user's history. | S2's history has none of S1's bookings; advisor B's has none on A's slots. |
| AC-F18-04 | Deleted slots and reschedules keep their history. | A cancelled booking on a later-deleted slot is listed for both roles. A rescheduled booking's old row is listed as cancelled by the student. |
| AC-F18-05 | Passed boundary and empty list. | Slot ending 10:30: not listed at 10:29:59, listed "Passed" at 10:30:00. A new student gets `[]`. |

## 8. Software Test Specification (STS)

Test file: `server/tests/bookings.history.test.ts` (API, Supertest, `_test` database). Rows are inserted with Prisma (including CANCELLED rows with `cancelledById` and `cancelReason`) so no Sprint 2 endpoint is needed in the setup. Fake clock, Asia/Bangkok, now = Mon 9 Nov 10:00 unless stated.

| TEST | AC | Level | Precondition / input | Action | Expected |
|---|---|---|---|---|---|
| TEST-F18-01 | AC-F18-01 | API | S1: booking on Thu 12 Nov cancelled by S1; booking on Wed 11 Nov cancelled by advisor A with "Sick leave"; ACTIVE booking on Fri 6 Nov (ended); ACTIVE booking on Fri 13 Nov. | S1: `GET /api/bookings/history`. | 200, 3 items in order Thu, Wed, Fri 6; cancellation fields as AC-F18-01; Fri 13 not listed. |
| TEST-F18-02 | AC-F18-02 | API | A's slots: S1 cancelled (Thu), S2 passed (Fri 6). B's slot: S3 cancelled. | A: `GET`. | 2 items, `student` S1 and S2; S3's booking absent. |
| TEST-F18-03 | AC-F18-03 | API | State of TEST-F18-02. S2 and B logged in. | S2: `GET`; B: `GET`. | S2: only S2's passed booking. B: only S3's booking. |
| TEST-F18-04 | AC-F18-04 | API | A's slot Thu 12 Nov 10:00: S1's booking CANCELLED, then the slot soft-deleted (`deletedAt` set). S2: an old CANCELLED booking (cancelled by S2, reason null) and a new ACTIVE booking (a reschedule pair). | S1 and A: `GET`; S2: `GET`. | Both S1 and A list the deleted slot's booking. S2 lists the old one cancelled by S2. |
| TEST-F18-05 | AC-F18-05 | API | S1: ACTIVE booking on Mon 9 Nov 10:00 to 10:30. S4: no bookings. | S1 `GET` at 10:29:59 and at 10:30:00; S4 `GET`. | Not listed; listed "Passed"; S4 `[]`. |

R-01: `r01.auth.test.ts` adds `GET /api/bookings/history` to the 401 list.

UI/E2E: one Playwright step: the advisor cancels with a reason (F-11), the student opens `/bookings` and sees "Cancelled by <advisor>: <reason>".

### 8.1 TDD plan

TEST-F18-01 to -05 first, red (route missing: the asserted status fails, not a compile error), then the endpoint and the screens.

## 9. Known limitations

- No paging. With the course data size (a few hundred bookings) one list is fine; paging is debt if the data grows.
- No link between a rescheduled booking and its new booking (F-14 section 6); the old one reads "Cancelled by you".

## 10. Completion evidence

Failing-then-passing runs, `npm test` output with counts, PR link and reviewer, Issue link.
