# F-13 Delete slot: Engineering Contract

| Item | Value |
|---|---|
| Feature | F-13 Delete slot |
| Sprint | 2 |
| Owner | Jeerasak Phisawong (reviewer: Chanat Dachkhumhang) |
| Status | Contract draft. Implementation not started (Issue #73). |
| Linked requirements | FR-13, BR-08, BR-13, BR-14, NFR-03, NFR-07 (see section 1) |
| Depends on | F-04 (slots exist), F-07 (bookings exist) |
| Needed by | F-17 (counts ignore deleted slots), F-18 (history keeps the slot of a cancelled booking) |
| Related documents | `docs/srs.md` (v0.4), `docs/features.md`, `docs/system-sds.md` (v0.7) sections 3.1, 5, 6, `docs/decisions.md` (D-09, D-24, D-29), `docs/sprints/sprint-1/F-04-create-slot.md`, `F-05-view-own-slots.md`, `F-06-view-bookable-slots.md`, `F-07-book-slot.md` |

## Version history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-22 | Jeerasak (drafted with an AI agent) | First contract, written before implementation. Awaiting team review (Issue #68). |

## 1. Linked requirements

| ID | Text (short) | How F-13 meets it |
|---|---|---|
| FR-13 | An advisor deletes their own unbooked slot. | `DELETE /api/slots/:id` sets `deletedAt` (section 4). |
| BR-08 | Only advisors maintain slots, and only their own. | `requireRole("ADVISOR")`; the slot must have `advisorId` = the session user, otherwise 404. |
| BR-14 | A slot with an active booking cannot be deleted. The booking must be cancelled first. | 409 `SLOT_HAS_ACTIVE_BOOKING`. Only a booking with `status = ACTIVE` blocks. |
| BR-13 | A cancelled booking frees its slot. | A slot whose bookings are all `CANCELLED` can be deleted (AC-F13-03). |
| NFR-03 | A user calling an operation for another role gets 403. | A student gets 403 `FORBIDDEN_ROLE`. |
| NFR-07 | Rejections use the SDS error shape. | All errors of section 4.3. |

D-29 adds: delete only before the slot starts, soft delete, a deleted slot is "not found" everywhere.

## 2. Behavior and workflow

1. On `/schedule` (F-05 list) the advisor clicks Delete on a slot with status Open or Closed and confirms.
2. The client sends `DELETE /api/slots/:id`.
3. `requireAuth` loads the user; `requireRole("ADVISOR")` rejects a student with 403.
4. The server validates `:id` (section 3.1).
5. Inside one transaction the server:
   1. locks the slot row: `SELECT ... FROM "Slot" WHERE id = $1 FOR UPDATE` (SDS section 3.1, BR-14 row);
   2. returns 404 if the row is missing, has `deletedAt` set, or belongs to another advisor;
   3. returns 422 `SLOT_ALREADY_STARTED` if `startAt <= now` (D-29);
   4. returns 409 `SLOT_HAS_ACTIVE_BOOKING` if a `Booking` with this `slotId` and `status = ACTIVE` exists (BR-14);
   5. sets `deletedAt = now`.
6. The server responds 204 with no body. The client removes the row from the list.

"Now" is the server clock (`new Date()`), as in F-04.

After the delete:
- F-05 (`GET /api/slots/mine`) and F-06 (`GET /api/slots/bookable`) no longer return the slot. Both already filter `deletedAt: null` (Sprint 1 code).
- F-07 booking it returns 404 `NOT_FOUND` (Sprint 1 code already reads the slot with `deletedAt: null`).
- The exclusion constraint `Slot_no_overlap` has `WHERE ("deletedAt" IS NULL)`, so the advisor can create a new slot at the same time.
- Cancelled bookings keep their `slotId`; the row is not removed (foreign keys are restricted, SDS section 3.1).

### 2.1 Cross-feature change: booking locks the slot row

Without a lock, this order breaks BR-14: a booking reads the slot (not deleted), the delete checks for an ACTIVE booking (none committed yet) and commits, then the booking inserts. The result is a deleted slot with an ACTIVE booking.

So the booking transaction in `server/src/services/bookings.ts` (F-07) must read the slot with `FOR UPDATE` too (one-line change, before its checks). F-14 books its new slot through the same code. With both sides locking the same row, delete and book run one after the other. The edit in F-12 uses the same lock.

This touches Chanat's file. It is made in the F-13 implementation PR, shown by TEST-F13-07, and Chanat confirms it in the review of this contract.

## 3. Validation, failures and boundaries

### 3.1 Input validation

| Field | Rule |
|---|---|
| `:id` | A positive integer. Anything else (`abc`, `0`, `-1`, `1.5`) returns 400 `VALIDATION_ERROR` (same as F-09). |
| Body | Ignored. |

### 3.2 Checks (in this order)

| # | Check | Rejected when | Response |
|---|---|---|---|
| 1 | Session | no valid session | 401 `UNAUTHENTICATED` |
| 2 | Role | caller is a student | 403 `FORBIDDEN_ROLE` |
| 3 | Id | section 3.1 fails | 400 `VALIDATION_ERROR` |
| 4 | Ownership | no slot with this id, `deletedAt` set, or `advisorId` ≠ caller | 404 `NOT_FOUND` |
| 5 | D-29 started | `startAt <= now` | 422 `SLOT_ALREADY_STARTED` |
| 6 | BR-14 | an ACTIVE booking exists on the slot | 409 `SLOT_HAS_ACTIVE_BOOKING` |

An ACTIVE booking on a slot that has already started is answered by check 5, so a past booking is never touched.

### 3.3 Failure and boundary cases

Times are Asia/Bangkok. "Now" is Mon 9 Nov 2026 10:00.

| Case | Result | Verified by |
|---|---|---|
| Own Open slot Tue 10 Nov 09:00, no bookings | 204, `deletedAt` = now | AC-F13-01 |
| Own Closed slot (future, deadline passed, unbooked) | 204 | AC-F13-01 |
| Own slot with an ACTIVE booking | 409 `SLOT_HAS_ACTIVE_BOOKING`, slot and booking unchanged | AC-F13-02 |
| Own slot whose only booking is CANCELLED | 204 | AC-F13-03 |
| Own slot starting exactly now (Mon 10:00) | 422 `SLOT_ALREADY_STARTED` | AC-F13-04 |
| Own slot in progress (Mon 09:30) or ended | 422 `SLOT_ALREADY_STARTED` | AC-F13-04 |
| Own slot starting at the next half hour (Mon 10:30) | 204 | AC-F13-04 |
| Another advisor's slot | 404 `NOT_FOUND`, slot unchanged | AC-F13-05 |
| Already deleted slot, or unknown id | 404 `NOT_FOUND` | AC-F13-05 |
| Student calls the endpoint | 403 `FORBIDDEN_ROLE` | AC-F13-05 |
| `:id` = `abc` | 400 `VALIDATION_ERROR` | AC-F13-05 |
| No session | 401 `UNAUTHENTICATED` | AC-R01-01 (shared) |
| Student books the deleted slot | 404 `NOT_FOUND` | AC-F13-06 |
| Advisor creates a new slot at the deleted slot's time | 201 | AC-F13-06 |
| Delete and book of the same Open slot in parallel | Never a deleted slot with an ACTIVE booking | AC-F13-07 |

### 3.4 Permissions

| Caller | Allowed |
|---|---|
| Advisor, own slot | Yes, under the checks of section 3.2. |
| Advisor, another advisor's slot | No. 404 `NOT_FOUND` (does not reveal the slot exists, SDS section 6). |
| Student | No. 403 `FORBIDDEN_ROLE`. |
| No valid session | No. 401 `UNAUTHENTICATED`. |

## 4. API contract

### 4.1 Request

`DELETE /api/slots/:id`, no body, `sid` cookie required.

### 4.2 Success response

`204 No Content`, empty body.

### 4.3 Error responses

Format (SDS section 5): `{ "error": { "code": "...", "message": "..." } }`.

| Status | `code` | `message` | When |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | "The slot id must be a positive integer." | Section 3.1. |
| 401 | `UNAUTHENTICATED` | "You are not logged in." | No valid session. |
| 403 | `FORBIDDEN_ROLE` | "Only advisors can delete slots." | Caller is a student. |
| 404 | `NOT_FOUND` | "Slot not found." | Check 4. |
| 409 | `SLOT_HAS_ACTIVE_BOOKING` | "This slot has a booking. Cancel the booking first." | Check 6. |
| 422 | `SLOT_ALREADY_STARTED` | "This slot has already started." | Check 5. |
| 500 | `INTERNAL_ERROR` | "Something went wrong." | Unexpected error. |

`SLOT_HAS_ACTIVE_BOOKING` was already listed in SDS section 5. `SLOT_ALREADY_STARTED` is new (SDS v0.7, D-29).

## 5. UI behavior

Screen `/schedule`, role advisor, the F-05 slot list.

| Part | Behavior |
|---|---|
| Delete button | Shown on rows with status Open or Closed. Not shown on Booked or Passed rows. The server still enforces every check. |
| Confirm | A confirm dialog: "Delete the slot on Tue 10 Nov 2026, 09:00-09:30?" with Delete and Cancel. |
| Loading | The row's buttons are disabled while the request runs. |
| Success (204) | The row disappears without a page reload, and a short "Slot deleted." message shows. |
| Error | A Bootstrap alert shows the server's `message`. On 404 or 409 the client reloads the list, because the slot changed in the meantime. |
| 401 | The client goes to `/login`. |

## 6. Data

| Layer | Change |
|---|---|
| Schema | None. `Slot.deletedAt` exists since the F-04 migration. |
| Migration | None. |
| Service | New `deleteSlot(advisorId, slotId, now)` in `server/src/services/slots.ts`. One-line lock in the F-07 booking transaction (section 2.1). |
| Route | `slotsRouter.delete("/:id", ...)` in `server/src/routes/slots.ts`. |
| Seed | No change. |
| Historical data | Existing rows all have `deletedAt` null; nothing to migrate. |

## 7. Acceptance criteria

| AC | Criterion | Expected, observable outcome |
|---|---|---|
| AC-F13-01 | An advisor deletes their own unbooked future slot (Open or Closed). | 204. The row still exists with `deletedAt` = now. The slot is missing from `GET /api/slots/mine` and `GET /api/slots/bookable`. |
| AC-F13-02 | A slot with an ACTIVE booking cannot be deleted (BR-14). | 409 `SLOT_HAS_ACTIVE_BOOKING`. `deletedAt` stays null; the booking stays ACTIVE. |
| AC-F13-03 | A slot whose bookings are all CANCELLED can be deleted (BR-13, BR-14). | 204, `deletedAt` set, the cancelled booking row unchanged. |
| AC-F13-04 | A slot that has started (or ended) cannot be deleted (D-29). | 422 `SLOT_ALREADY_STARTED` at `startAt = now` and after; 204 when the slot starts after now. |
| AC-F13-05 | Only the slot's advisor can delete it. | Student: 403 `FORBIDDEN_ROLE`. Another advisor's slot, a deleted slot, an unknown id: 404 `NOT_FOUND`. Non-integer id: 400. No row changes in any case. |
| AC-F13-06 | A deleted slot cannot be booked, and its time is free again. | `POST /api/bookings` with its id: 404 `NOT_FOUND`. `POST /api/slots` at the same start: 201. |
| AC-F13-07 | A delete and a booking of the same slot at the same time never leave a deleted slot with an ACTIVE booking. | In 10 rounds of parallel delete + book, each round ends with exactly one of: slot deleted and 0 ACTIVE bookings (book got 404), or slot not deleted with 1 ACTIVE booking (delete got 409). |

## 8. Software Test Specification (STS)

Test file: `server/tests/slots.delete.test.ts` (API and integration, Supertest against the `_test` database). E2E: `e2e/` Playwright (Sprint 1 journey setup).

Test clock: `vi.useFakeTimers({ toFake: ['Date'] })`, now = **Mon 9 Nov 2026 10:00** Asia/Bangkok (`2026-11-09T03:00:00Z`) unless a row says otherwise. Slots in the past are inserted directly with Prisma.

| TEST | AC | Level | Precondition / input | Action | Expected |
|---|---|---|---|---|---|
| TEST-F13-01 | AC-F13-01 | API | Advisor A has Tue 10 Nov 09:00 (Open) and Mon 9 Nov 11:00 inserted with `isLate` false (deadline Sun 18:00 passed, so Closed). | `DELETE` each. Then `GET /api/slots/mine` (A) and `GET /api/slots/bookable` (a student). | Both 204, empty body. Both rows have `deletedAt` = now. Neither list contains them. |
| TEST-F13-02 | AC-F13-02 | API | A's Tue 09:00 has an ACTIVE booking by student S. | `DELETE` it. | 409 `SLOT_HAS_ACTIVE_BOOKING`. `deletedAt` null; booking ACTIVE. |
| TEST-F13-03 | AC-F13-03 | API | A's Tue 09:00 has one booking with `status = CANCELLED` (inserted with Prisma). | `DELETE` it. | 204; booking row unchanged. |
| TEST-F13-04 | AC-F13-04 | API | A has slots Mon 9 Nov 09:30 (in progress), Mon 10:00 (starts now), Mon 10:30. | `DELETE` each. | 422 `SLOT_ALREADY_STARTED`, 422 `SLOT_ALREADY_STARTED`, 204. |
| TEST-F13-05 | AC-F13-05 | API | A has Tue 09:00; advisor B and student S logged in; A also has a deleted slot. | B deletes A's slot; S deletes it; A deletes the deleted slot; A deletes id 999999; A deletes id `abc`. | 404, 403, 404, 404, 400. A's slot `deletedAt` still null. |
| TEST-F13-06 | AC-F13-06 | API | A's Tue 09:00 deleted. | S: `POST /api/bookings {slotId}`. A: `POST /api/slots` Tue 09:00. | 404 `NOT_FOUND` (no booking row); 201. |
| TEST-F13-07 | AC-F13-07 | Integration | 10 rounds: A creates a fresh Open slot. | Each round: `Promise.all` of A's `DELETE` and S's `POST /api/bookings` on that slot. | After each round: never `deletedAt` set together with an ACTIVE booking. Responses are (204, 404) or (409, 201). |
| TEST-F13-08 | AC-F13-01 | E2E | Seeded advisor with a future Open slot. | Log in, `/schedule`, Delete on that row, confirm. Reload the page. | The row is gone and stays gone after reload. |

### 8.1 TDD plan

TEST-F13-01 to -07 are written first and run against `sprint-2` without the endpoint: they fail with 404 from Express (no route), which is the missing behavior, not a compile error. TEST-F13-07 is also run once with the endpoint but without the F-07 lock (section 2.1) to show the race, if it shows within 10 rounds; the output is kept either way. Then the endpoint and the lock make them pass. Red and green runs go to `evidence/f13-red.txt` and `evidence/f13-green.txt`.

## 9. Known limitations

- No undo of a delete.
- A deleted slot stays in the database; there is no purge.
- Cancelled bookings of a deleted slot are shown in history from Sprint 3 (F-18).

## 10. Completion evidence

In the F-13 PR and in Part B of the Deliverable 2 PDF: red/green runs, `npm test` counts, the PR with Chanat's review and merge into `sprint-2`, Issue #73. See the Sprint 2 Definition of Done.
