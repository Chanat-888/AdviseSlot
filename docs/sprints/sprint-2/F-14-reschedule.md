# F-14 Reschedule booking: Engineering Contract

| Item | Value |
|---|---|
| Feature | F-14 Reschedule booking |
| Sprint | 2 |
| Owner | Contract and implementation: Chanat Dachkhumhang (Issues #68, #71), reviewed by Jeerasak Phisawong. |
| Status | Contract draft. Implementation not started (Issue #71). Built last in Sprint 2. |
| Linked requirements | FR-14, BR-05, BR-06, BR-07 (as changed by #67), BR-11, BR-15, BR-16 (rule), BR-09, NFR-03, NFR-04, NFR-05 (see section 1) |
| Depends on | F-07 (booking checks), F-10 (cancel columns and the BR-11 check), **Lab 7 change #67 (new BR-07)** |
| Needed by | F-18 (the old booking appears as cancelled by the student) |
| Related documents | `docs/srs.md` (v0.4, BR-07 revised by #67), `docs/system-sds.md` sections 3, 5, 6, `docs/sprints/sprint-1/F-07-book-slot.md`, `docs/sprints/sprint-2/F-10-student-cancel.md`, Issue #67 |

## Version history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-22 | Chanat (drafted with an AI agent) | First contract, written before implementation, against the new BR-07 of change request #67. Awaiting team review. |

## 0. Dependency on the BR-07 change (#67)

Change request #67 (Lab 7) replaces BR-07 "at most one active booking" with "at most **two** active bookings in total and at most **one** with the same advisor". This contract is written against the new rule. F-14 is implemented only after #67 is implemented and merged into `sprint-2`.

If #67 is not approved, this contract is revised (new version) before F-14 code starts: check 6 below then becomes "no other active booking" and AC-F14-05 is replaced.

Consequence of BR-15 ("BR-07 is checked as if the old booking were already released"): after releasing the old booking the student holds at most one other active booking, so the two-booking limit can never be the reason a reschedule fails. Only the same-advisor part can (check 6).

## 1. Linked requirements

| ID | Text (short) | How F-14 meets it |
|---|---|---|
| FR-14 | A student reschedules their active booking to another bookable slot in one action. | `POST /api/bookings/:id/reschedule` with `{ newSlotId }` (section 4). |
| BR-15 | All-or-nothing. Old booking must pass BR-11; new slot must pass BR-05 and BR-06 (or BR-16); BR-07 checked as if the old booking were released. On failure the original booking stays unchanged. | One database transaction: cancel old, insert new. Any failure rolls back both (section 2). |
| BR-11 | Cancel only if the old slot starts at least 12 h from now. | `studentCanCancel` from F-10. 422 `CANCEL_WINDOW_PASSED`. |
| BR-05 | One active booking per slot, also under concurrency. | Partial unique index (F-07). A losing insert gives 409 `SLOT_TAKEN` and rolls back the old booking's cancel. |
| BR-06 / BR-16 | Booking deadline of the new slot. | `bookingDeadline` (F-07). 422 `BOOKING_DEADLINE_PASSED`. |
| BR-07 (#67) | Max 2 active bookings, max 1 with the same advisor. | Counted after the student row lock, excluding the old booking (check 6). 409 `SAME_ADVISOR_BOOKING`. |
| BR-09 | A student acts only on their own bookings. | Another student's booking: 404. |
| NFR-03 | Advisor gets 403. | `requireRole("STUDENT")`. |
| NFR-04 | Concurrency holds. | AC-F14-06 against the real database. |
| NFR-05 | Asia/Bangkok. | Boundaries in Bangkok time. |

## 2. Behavior and workflow

1. On `/bookings/:id` the student clicks Reschedule on an Upcoming booking.
2. The client goes to `/slots?reschedule=:id`, the F-06 list with a banner "Choose a new time for your booking on <date>". Each row has a Move here button instead of Book.
3. The client sends `POST /api/bookings/:id/reschedule` with `{ newSlotId }`.
4. `requireAuth`, `requireRole("STUDENT")`, body validation (section 3.1).
5. One transaction:
   1. Lock the student's row (`SELECT ... FOR UPDATE`, as F-07), so the student's own parallel requests run one after the other.
   2. Checks 1 to 6 of section 3.2.
   3. Update the old booking: `status` CANCELLED, `cancelledAt` = now, `cancelledById` = the student, `cancelReason` null, `WHERE id = $id AND status = 'ACTIVE'` (0 rows: 409 `BOOKING_NOT_ACTIVE`).
   4. Insert the new ACTIVE booking (`slotId` = `newSlotId`, `studentId` from the session, `createdAt` = now). A partial-unique-index violation (Prisma `P2002`) aborts the transaction: 409 `SLOT_TAKEN`, and the old booking is still ACTIVE.
6. 201 with the new booking (F-09 shape) and `previousBookingId`.
7. The client goes to `/bookings/<new id>` with "Booking moved."

The old slot is freed by step 5.3 and follows BR-13 (bookable again only before its deadline).

## 3. Validation, failures and boundaries

### 3.1 Input validation

| Field | Rule |
|---|---|
| `:id` | Positive integer. |
| `newSlotId` | Required positive integer. |
| Other fields | Ignored (the student is the session user). |

400 `VALIDATION_ERROR` without touching the database.

### 3.2 Checks (in this order, inside the transaction after the lock)

| # | Check | Rejected when | Response |
|---|---|---|---|
| 1 | Old booking visible | No booking with `:id`, or `studentId` is not the caller | 404 `NOT_FOUND` ("Booking not found.") |
| 2 | Old booking active | CANCELLED, or its slot has ended | 409 `BOOKING_NOT_ACTIVE` |
| 3 | BR-11 on the old booking | `old.startAt - now < 12 h` | 422 `CANCEL_WINDOW_PASSED` |
| 4 | New slot exists and differs | No slot `newSlotId` (or deleted): 404 `NOT_FOUND` ("This slot does not exist."). Same slot as the old booking: 400 `VALIDATION_ERROR` ("Choose a different slot.") | |
| 5 | New slot free and before deadline | Has an ACTIVE booking: 409 `SLOT_TAKEN`. `now >= bookingDeadline(newSlot)`: 422 `BOOKING_DEADLINE_PASSED` | |
| 6 | BR-07 (#67), old booking released | Among the student's other active bookings (excluding `:id`) one is with the new slot's advisor | 409 `SAME_ADVISOR_BOOKING` |
| 7 | BR-05 race | The insert in step 5.4 violates the partial unique index | 409 `SLOT_TAKEN` (whole transaction rolled back) |

Moving to another slot of the **same** advisor as the old booking is allowed: the old booking is excluded in check 6.

### 3.3 Failure and boundary cases

| Case | Result | Verified by |
|---|---|---|
| Old Thu 10:00 (A), new Thu 14:00 (B), both fine | 201; old CANCELLED by the student; new ACTIVE | AC-F14-01 |
| Old Wed 11 Nov 10:00: reschedule at Tue 22:00 / Tue 22:01 | 201 / 422 `CANCEL_WINDOW_PASSED`, nothing changed | AC-F14-02 |
| New slot morning Tue 09:00: at Mon 17:59 / Mon 18:00 | 201 / 422 `BOOKING_DEADLINE_PASSED`, old still ACTIVE | AC-F14-03 |
| New slot is a late slot: before / at 2 h before start | 201 / 422 `BOOKING_DEADLINE_PASSED` | AC-F14-03 |
| New slot already booked | 409 `SLOT_TAKEN`, old still ACTIVE | AC-F14-04 |
| Student holds A (old) and B; new slot of B | 409 `SAME_ADVISOR_BOOKING`, both unchanged | AC-F14-05 |
| Student holds A (old) and B; new slot of A (other time) | 201 (old A released first) | AC-F14-05 |
| Student holds A (old) and B; new slot of C | 201, student holds B and C | AC-F14-05 |
| Two students race: S1 reschedules into slot X while S2 books X | Exactly one succeeds; if S1 loses, S1's old booking is still ACTIVE | AC-F14-06 |
| Old booking already cancelled / passed | 409 `BOOKING_NOT_ACTIVE` | AC-F14-07 |
| Another student's booking | 404 `NOT_FOUND`, identical body to an unknown id | AC-F14-07 |
| Advisor calls | 403 `FORBIDDEN_ROLE` | AC-F14-07 |
| `newSlotId` equals the old slot | 400 `VALIDATION_ERROR` | AC-F14-07 |
| No session | 401 | AC-R01-01 (shared) |

### 3.4 Permissions

| Caller | Allowed |
|---|---|
| The booking's student | Yes. |
| Another student | No. 404. |
| Advisor | No. 403 `FORBIDDEN_ROLE` ("Only students can reschedule bookings."). |
| No valid session | No. 401. |

Matches SDS section 6 ("Reschedule": student own, advisor 403).

## 4. API contract

### 4.1 Request

`POST /api/bookings/:id/reschedule`, `sid` cookie required.

```json
{ "newSlotId": 15 }
```

### 4.2 Success response

`201 Created`: the new booking in the F-09 detail shape, plus the id of the booking it replaced.

```json
{
  "id": 21,
  "status": "Upcoming",
  "createdAt": "2026-11-09T03:00:00.000Z",
  "slot": { "id": 15, "startAt": "2026-11-12T07:00:00.000Z", "endAt": "2026-11-12T07:30:00.000Z" },
  "advisor": { "id": 2, "name": "Example Advisor B" },
  "student": { "id": 3, "name": "Example Student" },
  "previousBookingId": 12
}
```

### 4.3 Error responses

| Status | `code` | `message` | When |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | "A new slot is required." / "Choose a different slot." | Section 3.1 / check 4. |
| 401 | `UNAUTHENTICATED` | "You are not logged in." | No session. |
| 403 | `FORBIDDEN_ROLE` | "Only students can reschedule bookings." | Advisor. |
| 404 | `NOT_FOUND` | "Booking not found." / "This slot does not exist." | Checks 1 / 4. |
| 409 | `BOOKING_NOT_ACTIVE` | "This booking is no longer upcoming." | Check 2 (code from F-10). |
| 409 | `SLOT_TAKEN` | "This slot has just been booked by someone else." | Checks 5 and 7. |
| 409 | `SAME_ADVISOR_BOOKING` | "You already have an upcoming booking with this advisor." | Check 6 (code from #67). |
| 422 | `CANCEL_WINDOW_PASSED` | "You can cancel only until 12 hours before the start (22:00 on 10 Nov)." | Check 3 (F-10 message). |
| 422 | `BOOKING_DEADLINE_PASSED` | as F-07 | Check 5. |
| 500 | `INTERNAL_ERROR` | "Something went wrong." | Unexpected. |

No new codes beyond F-10 (`BOOKING_NOT_ACTIVE`) and #67 (`SAME_ADVISOR_BOOKING`).

## 5. UI behavior

| Screen | Behavior |
|---|---|
| `/bookings/:id` (student, Upcoming) | Reschedule button next to Cancel. |
| `/slots?reschedule=:id` | F-06 list with a banner naming the booking being moved, a Cancel-move link back to the booking, and Move here buttons. The current slot is not listed (it is booked). |
| Move here | Disabled with a spinner while the request runs. Success: go to `/bookings/<new id>`, "Booking moved." |
| 4xx | Bootstrap alert with the server's `message`; the list reloads. The original booking is unchanged, so no extra UI is needed. |

## 6. Data

No schema change: F-10's cancel columns and F-07's partial unique index are enough. The old booking is recorded as cancelled by the student with no reason.

Considered and not done: a `rescheduledFromId` link column. F-18 shows the old booking as "Cancelled by student"; the link can be added in Sprint 3 if F-18 needs it (a new D-xx then).

## 7. Acceptance criteria

| AC | Criterion | Expected, observable outcome |
|---|---|---|
| AC-F14-01 | A student moves an Upcoming booking to another bookable slot in one action. | 201, body section 4.2. Old row CANCELLED (`cancelledById` = student, `cancelReason` null), new ACTIVE row for the new slot. Old slot appears in the bookable list again (before its deadline). |
| AC-F14-02 | BR-11 on the old booking: exactly 12 h allowed, less rejected, nothing changes on rejection. | Old Wed 11 Nov 10:00: 201 at Tue 22:00; 422 `CANCEL_WINDOW_PASSED` at Tue 22:01, old ACTIVE, no new row. |
| AC-F14-03 | BR-06 / BR-16 on the new slot, nothing changes on rejection. | New Tue 09:00: 201 at Mon 17:59, 422 `BOOKING_DEADLINE_PASSED` at Mon 18:00 (old ACTIVE, no new row). New late Wed 09:00: 201 at Wed 06:59, 422 at Wed 07:00. |
| AC-F14-04 | A taken new slot is refused and the old booking stays. | 409 `SLOT_TAKEN`, old ACTIVE, new slot's booking still the other student's. |
| AC-F14-05 | New BR-07 (#67), with the old booking released: same advisor as another active booking is refused; same advisor as the old booking and a third advisor are allowed. | Holding A(old)+B: to B → 409 `SAME_ADVISOR_BOOKING`, nothing changes; to A (other time) → 201; to C → 201 and the student holds B and C. |
| AC-F14-06 | All-or-nothing under concurrency. | S1 reschedules into X while S2 books X (parallel, real database): exactly one 201, one 409 `SLOT_TAKEN`, no 500. X has 1 ACTIVE booking. If S1 lost, S1's old booking is ACTIVE and S1 has no new row. |
| AC-F14-07 | Ownership, role, state and input. | Other student's booking: 404 (same body as unknown id). Advisor: 403 `FORBIDDEN_ROLE`. Cancelled or passed old booking: 409 `BOOKING_NOT_ACTIVE`. Same slot: 400 `VALIDATION_ERROR`. No row changes in any case. |

## 8. Software Test Specification (STS)

Test file: `server/tests/bookings.reschedule.test.ts` (API, Supertest, `_test` database).

Test clock: fake `Date`, Asia/Bangkok, now = Mon 9 Nov 10:00 unless stated. Every rejected case also asserts "nothing changed": the old row is ACTIVE and the student's booking count is the same as before.

| TEST | AC | Level | Precondition / input | Action | Expected |
|---|---|---|---|---|---|
| TEST-F14-01 | AC-F14-01 | API | S1 booked A's Thu 12 Nov 10:00. B's Thu 12 Nov 14:00 Open. | S1 reschedules to B's slot; S2 lists bookable. | 201, `previousBookingId` = old id. Old CANCELLED by S1; new ACTIVE. A's Thu 10:00 in S2's list. |
| TEST-F14-02 | AC-F14-02 | API | A's Wed 11 Nov 10:00 booked by S1, B's Wed 11 Nov 10:00 booked by S2; C's two Open slots on Thu. | Now Tue 22:00: S1 reschedules to C's first. Now Tue 22:01: S2 reschedules to C's second. | 201; 422 `CANCEL_WINDOW_PASSED`, S2's old ACTIVE, C's second slot still Open. |
| TEST-F14-03 | AC-F14-03 | API | S1..S4 each hold a booking on Thu 12 Nov. New slots: Tue 10 Nov 09:00 for A and for B; late Wed 11 Nov 09:00 for A and for B. | S1 → A Tue 09:00 at Mon 17:59; S2 → B Tue 09:00 at Mon 18:00; S3 → A late at Wed 06:59; S4 → B late at Wed 07:00. (Old bookings start Thu, so BR-11 passes.) | 201, 422, 201, 422 `BOOKING_DEADLINE_PASSED`; rejected students' old bookings ACTIVE. |
| TEST-F14-04 | AC-F14-04 | API | S1 holds A Thu 10:00. B Thu 14:00 booked by S2. | S1 reschedules to B Thu 14:00. | 409 `SLOT_TAKEN`; S1's old ACTIVE; slot still S2's. |
| TEST-F14-05 | AC-F14-05 | API | S1 holds A Thu 10:00 (old) and B Thu 11:00. Open: B Thu 15:00, A Fri 10:00, C Fri 11:00. | S1 reschedules old → B 15:00; then old → A Fri 10:00; then (new A booking) → C Fri 11:00. | 409 `SAME_ADVISOR_BOOKING` (nothing changed); 201; 201, S1's active bookings are B Thu 11:00 and C Fri 11:00. |
| TEST-F14-06 | AC-F14-06 | API (database, concurrency) | S1 holds A Thu 10:00. Slot X (B Thu 14:00) Open. S2 has no booking. Repeat 20 times with fresh data. | `Promise.all` of S1 reschedule → X and S2 `POST /api/bookings` → X. | Each round: exactly one 2xx, one 409 `SLOT_TAKEN`, no 500; X has 1 ACTIVE booking; if S1 lost, S1's old booking ACTIVE and S1 has exactly 1 booking row. |
| TEST-F14-07 | AC-F14-07 | API | S1 holds an ACTIVE booking, a CANCELLED booking, a booking on an ended slot. S2 and advisor A logged in. | S2 reschedules S1's booking; A calls the endpoint; S1 reschedules the cancelled one and the ended one; S1 reschedules to its own slot. | 404 (same body as id 999999); 403 `FORBIDDEN_ROLE`; 409 `BOOKING_NOT_ACTIVE` twice; 400 `VALIDATION_ERROR`. No row changed. |

R-01: `r01.auth.test.ts` adds `POST /api/bookings/:id/reschedule` to the 401 list.

### 8.1 TDD plan

TEST-F14-01 to -07 are written first and run red (the route answers 404 from the router; the failure is the asserted status, not a compile error). Then the endpoint. TEST-F14-06 runs against the real PostgreSQL test database (NFR-04). Failing runs are kept as evidence.

## 9. Known limitations

- The old booking is shown as "Cancelled by student" with no link to the new one (section 6).
- The reschedule screen is the F-06 list; F-16 filters will also work there once F-16 is built.

## 10. Completion evidence

Failing-then-passing runs, concurrency test output, `npm test` output with counts, PR link and reviewer, Issue link (#71).
