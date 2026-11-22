# F-10 Student cancels booking: Engineering Contract

| Item | Value |
|---|---|
| Feature | F-10 Student cancels booking |
| Sprint | 2 |
| Owner | Contract and implementation: Chanat Dachkhumhang (Issues #68, #69), reviewed by Jeerasak Phisawong. |
| Status | Contract draft. Implementation not started (Issue #69). |
| Linked requirements | FR-10, BR-11, BR-13, BR-09, NFR-03, NFR-05 (see section 1) |
| Depends on | F-07 (bookings exist), F-09 (the detail screen holds the Cancel button) |
| Needed by | F-11 (shares the endpoint and the cancel fields), F-14 (reuses the BR-11 check), F-17, F-18 |
| Related documents | `docs/srs.md` (v0.4), `docs/features.md`, `docs/traceability.md`, `docs/system-sds.md` sections 3, 5, 6, `docs/decisions.md` (D-08, D-22, D-24), `docs/sprints/sprint-1/F-07-book-slot.md`, `docs/sprints/sprint-1/F-09-booking-detail.md` |

## Version history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-22 | Chanat (drafted with an AI agent) | First contract, written before implementation. Awaiting team review. |

## 1. Linked requirements

| ID | Text (short) | How F-10 meets it |
|---|---|---|
| FR-10 | A student cancels their own active booking. | `POST /api/bookings/:id/cancel` called by the booking's student (section 4). |
| BR-11 | A student can cancel only if the slot starts at least 12 hours from now. | New rule function `studentCanCancel(startAt, now)`: `startAt - now >= 12 h`. Otherwise 422 `CANCEL_WINDOW_PASSED`. |
| BR-13 | A cancelled booking frees its slot; the slot is bookable again only if its BR-06 / BR-16 deadline has not passed. | The booking becomes CANCELLED, so the partial unique index (ACTIVE only) no longer holds the slot. F-06 and F-07 already apply `bookingDeadline`, so no extra code: AC-F10-04 checks both cases. |
| BR-09 | A student acts only on their own bookings. | A booking of another student gives 404 `NOT_FOUND`, the same body as a missing booking. |
| NFR-03 | Role and ownership checks on the server. | Ownership check in section 3.2; the advisor path is F-11. |
| NFR-05 | Rule times use Asia/Bangkok. | The 12-hour boundary is tested in Bangkok time (AC-F10-02). |

## 2. Behavior and workflow

1. On `/bookings/:id` (F-09) the student sees a Cancel button when the booking is "Upcoming".
2. The student clicks Cancel and confirms in a dialog.
3. The client sends `POST /api/bookings/:id/cancel` with an empty JSON body.
4. `requireAuth`. The endpoint is shared with F-11: a STUDENT caller follows this contract, an ADVISOR caller follows F-11.
5. The server validates the id (section 3.1) and, inside one transaction, runs the checks of section 3.2 in order.
6. The update is conditional: `UPDATE "Booking" SET status = 'CANCELLED', ... WHERE id = $id AND status = 'ACTIVE'`. If 0 rows change (a parallel cancel won), the answer is 409 `BOOKING_NOT_ACTIVE`.
7. The server responds 200 with the booking (section 4.2), now "Cancelled".
8. The client shows "Booking cancelled." on the detail page. The slot reappears in `/slots` if its deadline has not passed (BR-13).

"Now" is the server clock in JavaScript, passed in, never the database `now()`.

## 3. Validation, failures and boundaries

### 3.1 Input validation

| Field | Rule |
|---|---|
| `:id` | A positive integer. Otherwise 400 `VALIDATION_ERROR`. |
| Body | Ignored for a student. A `reason` sent by a student is not stored (only F-11 stores a reason). |

### 3.2 Checks (in this order)

| # | Check | Rejected when | Response |
|---|---|---|---|
| 1 | Booking visible to caller | No booking with this id, or `studentId` is not the caller | 404 `NOT_FOUND` |
| 2 | Booking still active | `status` is CANCELLED, or the slot has ended ("Passed") | 409 `BOOKING_NOT_ACTIVE` |
| 3 | BR-11 window | `slot.startAt - now < 12 h` | 422 `CANCEL_WINDOW_PASSED` |
| 4 | Parallel cancel | The conditional update changes 0 rows | 409 `BOOKING_NOT_ACTIVE` |

A "Passed" booking would also fail check 3; check 2 comes first so the message says what happened.

### 3.3 Failure and boundary cases

| Case | Result | Verified by |
|---|---|---|
| Own Upcoming booking, slot starts in 3 days | 200, `status` "Cancelled", row CANCELLED with `cancelledAt` = now, `cancelledById` = student | AC-F10-01 |
| Slot Wed 10:00: cancel at Tue 22:00 (exactly 12 h) / Tue 22:01 (11 h 59 min) | 200 / 422 `CANCEL_WINDOW_PASSED` | AC-F10-02 |
| Booking already CANCELLED | 409 `BOOKING_NOT_ACTIVE`, row unchanged | AC-F10-03 |
| Booking on an ended slot | 409 `BOOKING_NOT_ACTIVE` | AC-F10-03 |
| After cancel, deadline not passed: another student books the slot | 201 (slot is free again) | AC-F10-04 |
| After cancel, deadline passed (cancel at least 12 h before, but BR-06 deadline already gone, e.g. morning slot Wed 09:00 cancelled Tue 20:00) | Slot not in `/api/slots/bookable`; `POST /api/bookings` gives 422 `BOOKING_DEADLINE_PASSED`; advisor sees "Closed" | AC-F10-04 |
| Another student's booking | 404 `NOT_FOUND`, identical body, row unchanged | AC-F10-05 |
| No session | 401 `UNAUTHENTICATED` | AC-R01-01 (shared) |
| Non-integer id | 400 `VALIDATION_ERROR` | AC-R02-01 (shared) |

Boundary style: "at least 12 hours" means exactly 12 h is allowed and anything less is rejected.

### 3.4 Permissions

| Caller | Allowed |
|---|---|
| The booking's student | Yes, within BR-11. |
| Another student | No. 404 `NOT_FOUND`. |
| The slot's advisor | Yes, but under F-11 rules (BR-12, reason required). |
| Another advisor | No. 404 `NOT_FOUND` (F-11). |
| No valid session | No. 401. |

Matches SDS section 6 ("Cancel booking": student own, BR-11).

## 4. API contract

### 4.1 Request

`POST /api/bookings/:id/cancel`, JSON body (empty for a student), `sid` cookie required.

### 4.2 Success response

`200 OK`. The F-09 detail shape, plus a `cancellation` object that is present only when `status` is "Cancelled":

```json
{
  "id": 12,
  "status": "Cancelled",
  "createdAt": "2026-11-09T03:00:00.000Z",
  "slot": { "id": 8, "startAt": "2026-11-11T03:00:00.000Z", "endAt": "2026-11-11T03:30:00.000Z" },
  "advisor": { "id": 1, "name": "Example Advisor" },
  "student": { "id": 3, "name": "Example Student" },
  "cancellation": {
    "cancelledAt": "2026-11-09T05:00:00.000Z",
    "cancelledBy": { "id": 3, "name": "Example Student", "role": "STUDENT" },
    "reason": null
  }
}
```

`GET /api/bookings/:id` (F-09) and `GET /api/bookings/mine` (F-08) return the same `cancellation` object for cancelled bookings. For Upcoming and Passed bookings the key is absent, so the Sprint 1 response bodies and their tests are unchanged.

### 4.3 Error responses

| Status | `code` | `message` | When |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | "The booking id must be a positive whole number." | Section 3.1. |
| 401 | `UNAUTHENTICATED` | "You are not logged in." | No valid session. |
| 404 | `NOT_FOUND` | "Booking not found." | Check 1. |
| 409 | `BOOKING_NOT_ACTIVE` | "This booking is no longer upcoming." | Checks 2 and 4. **New code.** |
| 422 | `CANCEL_WINDOW_PASSED` | "You can cancel only until 12 hours before the start (22:00 on 10 Nov)." (that booking's limit, Asia/Bangkok) | Check 3. Listed in SDS section 5 for Sprint 2. |
| 500 | `INTERNAL_ERROR` | "Something went wrong." | Unexpected error. |

SDS section 5 gets `BOOKING_NOT_ACTIVE` in the 409 row (same PR).

## 5. UI behavior

Screen `/bookings/:id`, role: student.

| Part | Behavior |
|---|---|
| Cancel button | Shown only when `status` is "Upcoming". The client does not pre-check BR-11; the server decides and its message is shown. |
| Confirm | A dialog "Cancel this booking?" with Yes / No. While the request runs, Yes is disabled with a spinner. |
| Success | The page shows the returned booking with the "Cancelled" badge and "Booking cancelled." |
| 409 / 422 | A Bootstrap alert with the server's `message`; the page reloads the booking. |
| 401 | Go to `/login`. |

`/bookings` (F-08) shows the cancelled booking under "Cancelled" (already supported by D-24).

## 6. Data

| Layer | Change |
|---|---|
| `Booking` | Three nullable columns: `cancelledAt` (timestamptz), `cancelledById` (FK to `User`, restrict), `cancelReason` (text). As planned in SDS section 3. F-10 writes `cancelledAt` and `cancelledById`; F-11 also writes `cancelReason`. |
| Constraint | Raw SQL CHECK in the same migration: `("status" = 'ACTIVE' AND "cancelledAt" IS NULL AND "cancelledById" IS NULL) OR ("status" = 'CANCELLED' AND "cancelledAt" IS NOT NULL AND "cancelledById" IS NOT NULL)`. |
| Migration | `prisma migrate dev --name add_booking_cancel`. Existing rows are all ACTIVE with nulls, so they satisfy the CHECK. No data backfill. |
| Rule function | `studentCanCancel(startAt: Date, now: Date): boolean` in `server/src/domain/rules.ts`. |
| Seed | Unchanged. |

```prisma
model Booking {
  // ... existing fields
  cancelledAt   DateTime? @db.Timestamptz(3)
  cancelledById Int?
  cancelledBy   User?     @relation("CancelledBookings", fields: [cancelledById], references: [id], onDelete: Restrict)
  cancelReason  String?
}
// in model User, add:  cancelledBookings Booking[] @relation("CancelledBookings")
```

## 7. Acceptance criteria

| AC | Criterion | Expected, observable outcome |
|---|---|---|
| AC-F10-01 | A student cancels their own Upcoming booking that starts in more than 12 hours. | 200, body section 4.2 with `status` "Cancelled" and `cancellation.cancelledBy.id` = the student. Row: CANCELLED, `cancelledAt` = now, `cancelledById` = student, `cancelReason` null. |
| AC-F10-02 | BR-11 boundary: exactly 12 h before the start is allowed, less is rejected. | Wed 11 Nov 10:00 slot: 200 at Tue 22:00; 422 `CANCEL_WINDOW_PASSED` at Tue 22:01 and the row stays ACTIVE. |
| AC-F10-03 | A booking that is not active cannot be cancelled. | Already CANCELLED: 409 `BOOKING_NOT_ACTIVE`. ACTIVE on an ended slot: 409 `BOOKING_NOT_ACTIVE`. Rows unchanged. |
| AC-F10-04 | BR-13: the freed slot is bookable again only before its deadline. | Afternoon slot Wed 14:00 cancelled Mon 10:00: in the bookable list and S2 books it (201). Morning slot Wed 09:00 cancelled Tue 20:00 (13 h before, after the Tue 18:00 deadline): not in the bookable list, S2 gets 422 `BOOKING_DEADLINE_PASSED`, advisor's `/api/slots/mine` shows "Closed". |
| AC-F10-05 | A student cannot cancel another student's booking. | 404 `NOT_FOUND` with the same body as an unknown id. Row unchanged. |

## 8. Software Test Specification (STS)

Test files:
- `server/tests/bookings.cancel.test.ts` (API, Supertest against the `_test` database; shared with F-11)
- `server/tests/domain.rules.test.ts` (unit tests of `studentCanCancel`)

Test clock: fake `Date` as in Sprint 1. Times are Asia/Bangkok. Unless stated, now = Mon 9 Nov 10:00. Bookings are inserted with Prisma so the time can be set freely.

| TEST | AC | Level | Precondition / input | Action | Expected |
|---|---|---|---|---|---|
| TEST-F10-01 | AC-F10-01 | API | S1 has an ACTIVE booking on Thu 12 Nov 10:00 (advisor A). S1 logged in. | `POST /api/bookings/:id/cancel`. | 200, `status` "Cancelled", `cancellation.cancelledBy` = S1, `reason` null. Row CANCELLED with `cancelledAt` = now. |
| TEST-F10-02 | AC-F10-02 | Unit + API | Slots Wed 11 Nov 10:00 for advisors A and B; S1 booked A's, S2 booked B's. | Unit: `studentCanCancel` at Tue 22:00 / 22:01. API: S1 cancels at Tue 22:00; S2 cancels at Tue 22:01. | Unit: true / false. API: 200; 422 `CANCEL_WINDOW_PASSED`, S2's row still ACTIVE. |
| TEST-F10-03 | AC-F10-03 | API | S1 has a CANCELLED booking (future slot) and an ACTIVE booking on Fri 6 Nov 10:00 (ended). | S1 cancels each. | 409 `BOOKING_NOT_ACTIVE` both times, rows unchanged. |
| TEST-F10-04 | AC-F10-04 | API | S1 booked Wed 11 Nov 14:00 (advisor A) and S3 booked Wed 11 Nov 09:00 (advisor B). | Now Mon 10:00: S1 cancels; S2 lists bookable and books it. Now Tue 20:00: S3 cancels; S2 lists bookable and books B's slot; advisor B lists own slots. | 201 for the first. Second: slot absent from the list, 422 `BOOKING_DEADLINE_PASSED`, status "Closed". |
| TEST-F10-05 | AC-F10-05 | API | S1 has an ACTIVE booking. S2 logged in. | S2 cancels S1's booking; S2 cancels id 999999. | Both 404 with identical bodies. S1's row ACTIVE. |

R-01 extension: `server/tests/r01.auth.test.ts` adds `POST /api/bookings/:id/cancel` to the 401 list (TEST-R01-01).

UI/E2E: the Playwright journey adds one step: the student cancels the booking from the detail page and sees "Cancelled" (no new TEST id, covers AC-R02-02 for a Sprint 2 rejection when cancelling inside 12 h is shown).

### 8.1 TDD plan

`studentCanCancel` unit tests first (red), then the API tests TEST-F10-01 to -05 (red, the route does not exist yet: the failure must be 404 from the router or the assertion, not a compile error), then the migration and the endpoint. Failing runs are kept as evidence.

## 9. Known limitations

- The student cannot give a reason (FR-10 does not ask for one).
- Cancelled bookings are listed with who cancelled in Sprint 3 (F-18). In Sprint 2 the detail page already shows the `cancellation` object.

## 10. Completion evidence

Failing-then-passing runs, `npm test` output with counts, PR link and reviewer, Issue link (#69). See `definition-of-done.md`.
