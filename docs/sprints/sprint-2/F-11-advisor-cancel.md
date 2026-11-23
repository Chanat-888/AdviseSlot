# F-11 Advisor cancels booking: Engineering Contract

| Item | Value |
|---|---|
| Feature | F-11 Advisor cancels booking |
| Sprint | 2 |
| Owner | Contract and implementation: Chanat Dachkhumhang (Issues #68, #70), reviewed by Jeerasak Phisawong. |
| Status | Implemented on `feat/f11-advisor-cancel` (Issue #70). |
| Linked requirements | FR-11, BR-12, BR-13, BR-08, BR-09, NFR-03, NFR-05 (see section 1) |
| Depends on | F-07, F-09, F-10 (shares the endpoint, the cancel columns and the response shape) |
| Needed by | F-17 (cancelled count), F-18 (history with reason) |
| Related documents | `docs/srs.md` (v0.4), `docs/system-sds.md` sections 3, 5, 6, `docs/decisions.md` (D-08, D-18), `docs/sprints/sprint-2/F-10-student-cancel.md` |

## Version history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-22 | Chanat (drafted with an AI agent) | First contract, written before implementation. Awaiting team review. |
| 0.2 | 2026-11-22 | Chanat (drafted with an AI agent) | Review of PR #76: `cancelReason` length CHECK decided (yes), added in the F-10 migration. |
| 0.3 | 2026-11-23 | Chanat (drafted with an AI agent) | Status: implemented (Issue #70). No change to the contract itself. |

## 1. Linked requirements

| ID | Text (short) | How F-11 meets it |
|---|---|---|
| FR-11 | An advisor cancels an active booking on their own slot and must enter a reason. The student sees the reason. | `POST /api/bookings/:id/cancel` with `{ reason }` by the slot's advisor. The reason is stored and returned in `cancellation.reason` to both roles (F-09 detail, F-08 list). |
| BR-12 | Allowed until the slot starts, with a reason of 1 to 500 characters. | New rule function `advisorCanCancel(startAt, now)`: `now < startAt`. Otherwise 422 `CANCEL_WINDOW_PASSED`. Reason trimmed, length 1 to 500, otherwise 400 `VALIDATION_ERROR`. |
| BR-13 | A cancelled booking frees its slot; bookable again only before its deadline. | Same as F-10: the row becomes CANCELLED; F-06 and F-07 apply `bookingDeadline`. |
| BR-08 | Advisors maintain only their own slots. | A booking on another advisor's slot gives 404 `NOT_FOUND`. |
| BR-09 | An advisor sees only bookings on their own slots. | Same 404 rule. |
| NFR-03 | Server-side role and ownership checks. | Section 3.2. |
| NFR-05 | Asia/Bangkok times. | The start-time boundary is tested in Bangkok time (AC-F11-02). |

## 2. Behavior and workflow

1. On `/schedule` (F-05) the advisor opens a Booked slot's booking (`/bookings/:id`, F-09).
2. The advisor clicks Cancel booking. A dialog asks for a reason (textarea, counter "n / 500").
3. The client sends `POST /api/bookings/:id/cancel` with `{ "reason": "..." }`.
4. `requireAuth`. An ADVISOR caller follows this contract (a STUDENT caller follows F-10).
5. The server validates (section 3.1), then inside one transaction runs the checks of section 3.2.
6. Conditional update as in F-10: `status` CANCELLED, `cancelledAt` = now, `cancelledById` = advisor, `cancelReason` = the trimmed reason, `WHERE id = $id AND status = 'ACTIVE'`. 0 rows: 409 `BOOKING_NOT_ACTIVE`.
7. 200 with the booking (F-10 section 4.2 shape).
8. The client shows "Booking cancelled." On `/schedule` the slot shows Open or Closed again (BR-13, D-24).

## 3. Validation, failures and boundaries

### 3.1 Input validation

| Field | Rule |
|---|---|
| `:id` | A positive integer. |
| `reason` | Required for an advisor. A string. Trimmed; after trimming 1 to 500 characters (JavaScript string length). Missing, not a string, empty or only spaces, or longer than 500: 400 `VALIDATION_ERROR`. |

Validation failures return 400 before any database read, so an advisor who sends no reason for someone else's booking still gets 400 (no information leaks: 400 does not say whether the booking exists).

### 3.2 Checks (in this order)

| # | Check | Rejected when | Response |
|---|---|---|---|
| 1 | Booking visible to caller | No booking with this id, or the slot's `advisorId` is not the caller | 404 `NOT_FOUND` |
| 2 | Booking still active | `status` CANCELLED, or the slot has ended | 409 `BOOKING_NOT_ACTIVE` |
| 3 | BR-12 window | `now >= slot.startAt` | 422 `CANCEL_WINDOW_PASSED` |
| 4 | Parallel cancel | Conditional update changes 0 rows (for example the student cancelled at the same moment) | 409 `BOOKING_NOT_ACTIVE` |

### 3.3 Failure and boundary cases

| Case | Result | Verified by |
|---|---|---|
| Own slot, booking Upcoming, reason "Sick leave" | 200, row CANCELLED with the reason | AC-F11-01 |
| Slot Tue 10:00: cancel at Tue 09:59 / Tue 10:00 | 200 / 422 `CANCEL_WINDOW_PASSED` | AC-F11-02 |
| Slot starts in 1 hour (inside the student's 12 h window) | 200: the 12 h limit is only for students | AC-F11-02 |
| Reason of 1 character / 500 characters | 200 | AC-F11-03 |
| Reason "", "   ", 501 characters, missing, or a number | 400 `VALIDATION_ERROR`, row unchanged | AC-F11-03 |
| Reason with spaces around it, "  Room change  " | Stored as "Room change" | AC-F11-03 |
| Student opens the cancelled booking | `cancellation.reason` is the advisor's text, `cancelledBy.role` "ADVISOR" | AC-F11-04 |
| Booking on another advisor's slot | 404 `NOT_FOUND`, row unchanged | AC-F11-05 |
| Already cancelled (for example by the student) | 409 `BOOKING_NOT_ACTIVE` | AC-F11-05 |
| Freed slot before / after its deadline | Bookable / "Closed" (same as AC-F10-04, not repeated) | AC-F10-04 |
| No session | 401 | AC-R01-01 (shared) |

### 3.4 Permissions

| Caller | Allowed |
|---|---|
| The slot's advisor | Yes, until the slot starts, with a reason. |
| Another advisor | No. 404 `NOT_FOUND`. |
| The booking's student | Yes, but under F-10 rules (BR-11, no reason). |
| Another student | No. 404 (F-10). |
| No valid session | No. 401. |

## 4. API contract

### 4.1 Request

`POST /api/bookings/:id/cancel`, `sid` cookie required.

```json
{ "reason": "I am sick today. Please book another slot." }
```

### 4.2 Success response

`200 OK`, the shape of F-10 section 4.2 with:

```json
"cancellation": {
  "cancelledAt": "2026-11-10T01:00:00.000Z",
  "cancelledBy": { "id": 1, "name": "Example Advisor", "role": "ADVISOR" },
  "reason": "I am sick today. Please book another slot."
}
```

### 4.3 Error responses

| Status | `code` | `message` | When |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | "A reason of 1 to 500 characters is required." | `reason` fails section 3.1. |
| 400 | `VALIDATION_ERROR` | "The booking id must be a positive whole number." | `:id` fails. |
| 401 | `UNAUTHENTICATED` | "You are not logged in." | No valid session. |
| 404 | `NOT_FOUND` | "Booking not found." | Check 1. |
| 409 | `BOOKING_NOT_ACTIVE` | "This booking is no longer upcoming." | Checks 2 and 4 (code from F-10). |
| 422 | `CANCEL_WINDOW_PASSED` | "This appointment has already started." | Check 3. |
| 500 | `INTERNAL_ERROR` | "Something went wrong." | Unexpected error. |

## 5. UI behavior

Screen `/bookings/:id`, role: advisor.

| Part | Behavior |
|---|---|
| Cancel booking button | Shown when `status` is "Upcoming". |
| Dialog | Textarea "Reason (shown to the student)", live counter "n / 500", Confirm disabled while the trimmed text is empty or longer than 500. The server still validates (the UI check is not the rule). |
| Success | Detail shows "Cancelled", the reason, and "Booking cancelled." |
| 400 / 409 / 422 | Bootstrap alert with the server's `message`. |

Student side: `/bookings/:id` and `/bookings` show "Cancelled by <advisor name>: <reason>" for a booking with `cancellation.cancelledBy.role` "ADVISOR".

## 6. Data

No new columns: F-10 adds `cancelledAt`, `cancelledById` and `cancelReason`. F-11 is the only writer of `cancelReason`.

CHECK (in the F-10 migration, agreed in review of PR #76): `"cancelReason" IS NULL OR char_length("cancelReason") BETWEEN 1 AND 500`. The service trims before writing, so the CHECK backs the 1 to 500 rule of BR-12.

Rule function: `advisorCanCancel(startAt: Date, now: Date): boolean` in `server/src/domain/rules.ts`.

## 7. Acceptance criteria

| AC | Criterion | Expected, observable outcome |
|---|---|---|
| AC-F11-01 | The slot's advisor cancels an Upcoming booking with a reason. | 200, `status` "Cancelled", `cancellation.cancelledBy.role` "ADVISOR", `reason` as sent (trimmed). Row: CANCELLED, `cancelledById` = advisor, `cancelReason` set. |
| AC-F11-02 | BR-12 boundary: allowed until the start, rejected at the start; the student's 12 h limit does not apply. | Tue 10 Nov 10:00 slot: 200 at Tue 09:59, 422 `CANCEL_WINDOW_PASSED` at Tue 10:00 (row stays ACTIVE). A slot 1 h away: 200. |
| AC-F11-03 | The reason is required, 1 to 500 characters after trimming. | 1 and 500 characters: 200. "", spaces only, 501 characters, missing, number: 400 `VALIDATION_ERROR`, row unchanged. "  Room change  " stored as "Room change". |
| AC-F11-04 | The student sees the advisor's reason. | After AC-F11-01, the student's `GET /api/bookings/:id` and `GET /api/bookings/mine` include `cancellation` with the reason and `cancelledBy.role` "ADVISOR". |
| AC-F11-05 | Ownership and state: another advisor's booking and an already cancelled booking are refused. | Advisor B on advisor A's booking: 404 `NOT_FOUND`. Advisor A on a booking the student already cancelled: 409 `BOOKING_NOT_ACTIVE`. Rows unchanged. |

## 8. Software Test Specification (STS)

Test files: `server/tests/bookings.cancel.test.ts` (shared with F-10), `server/tests/domain.rules.test.ts`.

Test clock: fake `Date`, Asia/Bangkok, now = Mon 9 Nov 10:00 unless stated.

| TEST | AC | Level | Precondition / input | Action | Expected |
|---|---|---|---|---|---|
| TEST-F11-01 | AC-F11-01 | API | S1 booked advisor A's Thu 12 Nov 10:00. A logged in. | A: cancel with `{ reason: "Sick leave" }`. | 200, body as section 4.2, row CANCELLED with `cancelReason` "Sick leave", `cancelledById` = A. |
| TEST-F11-02 | AC-F11-02 | Unit + API | A's slots Tue 10 Nov 10:00 (booked by S1) and Tue 10 Nov 11:00 (booked by S2), plus B's Tue 10:00 booked by S3. | Unit: `advisorCanCancel` at 09:59 / 10:00. API: A cancels S1's at Tue 09:59; B cancels S3's at Tue 10:00; A cancels S2's at Tue 10:00 (1 h before). | Unit: true / false. API: 200; 422 `CANCEL_WINDOW_PASSED` with S3's row ACTIVE; 200. |
| TEST-F11-03 | AC-F11-03 | API | Eight bookings on A's future slots. | A cancels with reasons: "x", 500 × "x", "", "   ", 501 × "x", no `reason`, `reason: 5`, "  Room change  ". | 200, 200, 400, 400, 400, 400, 400, 200 with stored "Room change". Rows of the 400 cases stay ACTIVE. |
| TEST-F11-04 | AC-F11-04 | API | State after TEST-F11-01. S1 logged in. | S1: `GET /api/bookings/:id` and `GET /api/bookings/mine`. | Both include `cancellation.reason` "Sick leave" and `cancelledBy.role` "ADVISOR". |
| TEST-F11-05 | AC-F11-05 | API | S1 booked A's slot; S2 booked A's other slot and cancelled it (F-10). B logged in, A logged in. | B cancels S1's booking with a reason. A cancels S2's booking with a reason. | 404 `NOT_FOUND`; 409 `BOOKING_NOT_ACTIVE`. Rows unchanged. |

R-01: `r01.auth.test.ts` already covers the shared endpoint (F-10).

### 8.1 TDD plan

`advisorCanCancel` unit tests first (red), then TEST-F11-01 to -05 (red against the F-10 endpoint, which does not accept advisors yet: the failure is the asserted status, not a compile error), then the advisor branch of the endpoint. Failing runs are kept.

## 9. Known limitations

- No notification to the student; the student sees the reason when opening the booking (no external messaging, SRS).
- The reason cannot be edited after cancelling.

## 10. Completion evidence

Failing-then-passing runs, `npm test` output with counts, PR link and reviewer, Issue link (#70).
