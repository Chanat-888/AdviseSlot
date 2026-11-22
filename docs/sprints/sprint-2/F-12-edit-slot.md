# F-12 Edit slot: Engineering Contract

| Item | Value |
|---|---|
| Feature | F-12 Edit slot |
| Sprint | 2 |
| Owner | Jeerasak Phisawong (reviewer: Chanat Dachkhumhang) |
| Status | Contract draft. Implementation not started (Issue #72). |
| Linked requirements | FR-12, BR-01, BR-02, BR-03, BR-04, BR-08, BR-13, BR-14, BR-16 (rule), NFR-03, NFR-05, NFR-07 (see section 1) |
| Depends on | F-04 (rules and `checkSlotStart`), F-13 (shares the slot lock and `SLOT_ALREADY_STARTED`) |
| Needed by | none |
| Related documents | `docs/srs.md` (v0.4), `docs/features.md`, `docs/system-sds.md` (v0.7) sections 3.1, 5, 6, 11 (O-03), `docs/decisions.md` (D-09, D-23, D-24, D-28, D-29), `docs/sprints/sprint-1/F-04-create-slot.md`, `docs/sprints/sprint-2/F-13-delete-slot.md` |

## Version history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-22 | Jeerasak (drafted with an AI agent) | First contract, written before implementation. Awaiting team review (Issue #68). |
| 0.2 | 2026-11-22 | Jeerasak (drafted with an AI agent) | Review on PR #77: the self-overlap case is the unchanged start (09:00), not 09:30, which only touches the old range; TEST-F12-03 updated, 09:30 kept as a back-to-back case. Section 9: editing a Closed slot reopens it as a late slot without a notification (for the F-19 contract). |

## 1. Linked requirements

| ID | Text (short) | How F-12 meets it |
|---|---|---|
| FR-12 | An advisor changes the start time of their own unbooked future slot. | `PATCH /api/slots/:id` with `{ startAt }` (section 4). |
| BR-01 | Every slot is 30 minutes; the client sends only the start. | `endAt = startAt + 30 min`; any `endAt` in the body is ignored. |
| BR-02 | Weekday, :00/:30, 08:00 to 18:00 (Asia/Bangkok). | Same `checkSlotStart` as F-04, on the new start. |
| BR-03 | A slot cannot be created or moved to a start time in the past. | `SLOT_IN_PAST` on the new start. |
| BR-04 | An advisor's slots cannot overlap. | Overlap check ignores the slot itself; the exclusion constraint also fires on UPDATE. |
| BR-08 | Only advisors maintain slots, and only their own. | `requireRole("ADVISOR")`; another advisor's slot is 404. |
| BR-14 | A slot with an active booking cannot be edited. | 409 `SLOT_HAS_ACTIVE_BOOKING`. Only `status = ACTIVE` blocks. |
| BR-13 | A cancelled booking frees its slot. | A slot whose bookings are all CANCELLED can be edited. |
| BR-16 (rule) | Late slots. | D-28: `isLate` is recomputed for the new start as if created now; a late new start 2 h or less away is 422 `SLOT_UNBOOKABLE`. |
| NFR-03 | Wrong role gets 403. | A student gets 403 `FORBIDDEN_ROLE`. |
| NFR-05 | Rule times in Asia/Bangkok, with boundaries. | Same rule functions and boundary tests as F-04. |
| NFR-07 | SDS error shape. | Section 4.3. |

## 2. Behavior and workflow

1. On `/schedule` the advisor clicks Edit on an Open or Closed slot. The row turns into a form with the date and start time preselected.
2. The advisor picks a new date and/or start time and clicks Save. The client sends `PATCH /api/slots/:id` with `{ startAt }` (UTC ISO string, as in F-04).
3. `requireAuth`, then `requireRole("ADVISOR")` (403 for a student).
4. The server validates `:id` and the body (section 3.1).
5. Inside one transaction the server:
   1. locks the slot row with `SELECT ... FOR UPDATE` (SDS section 3.1, same lock as F-13 and F-07);
   2. returns 404 if the slot is missing, deleted, or another advisor's;
   3. returns 422 `SLOT_ALREADY_STARTED` if the **current** `startAt <= now` (D-29);
   4. returns 409 `SLOT_HAS_ACTIVE_BOOKING` if an ACTIVE booking exists (BR-14);
   5. runs `checkSlotStart(newStart, now)` (F-04 rules 1 to 5 in F-04 order, including `SLOT_UNBOOKABLE`);
   6. checks for another own slot with `deletedAt` null, `id ≠ this id`, and overlapping `[newStart, newStart + 30 min)` → 409 `SLOT_OVERLAP`;
   7. updates `startAt`, `endAt = newStart + 30 min` and `isLate = isLateSlot(newStart, now)` (D-28). `createdAt` stays.
6. If the exclusion constraint fires (a parallel create), the answer is also 409 `SLOT_OVERLAP` (same 23P01 mapping as F-04).
7. The server responds 200 with the slot in the F-05 item shape. The client replaces the row and re-sorts the list.

Editing to the same start time is allowed. It still recomputes `isLate` (D-28: like deleting and creating the slot now).

Editing sends no notification, even when the slot becomes late (D-28; FR-19 covers created slots).

## 3. Validation, failures and boundaries

### 3.1 Input validation

| Field | Rule |
|---|---|
| `:id` | A positive integer, otherwise 400 `VALIDATION_ERROR`. |
| `startAt` | Required. ISO 8601 string with a time zone that parses to a valid instant (same parser as F-04). |
| `endAt`, `isLate`, `advisorId`, any other field | Ignored. |
| Body | A JSON object. |

### 3.2 Checks (in this order)

| # | Check | Rejected when | Response |
|---|---|---|---|
| 1 | Session | no valid session | 401 `UNAUTHENTICATED` |
| 2 | Role | caller is a student | 403 `FORBIDDEN_ROLE` |
| 3 | Input | section 3.1 fails | 400 `VALIDATION_ERROR` |
| 4 | Ownership | slot missing, deleted, or another advisor's | 404 `NOT_FOUND` |
| 5 | D-29 started | current `startAt <= now` | 422 `SLOT_ALREADY_STARTED` |
| 6 | BR-14 | an ACTIVE booking exists | 409 `SLOT_HAS_ACTIVE_BOOKING` |
| 7 to 11 | F-04 rules 1 to 5 on the new start | as F-04 section 3.2 | 422 `SLOT_NOT_WEEKDAY`, `SLOT_INVALID_START_MINUTE`, `SLOT_OUTSIDE_HOURS`, `SLOT_IN_PAST`, `SLOT_UNBOOKABLE` |
| 12 | BR-04 | overlaps another own live slot | 409 `SLOT_OVERLAP` |

A rejected request changes nothing.

### 3.3 Failure and boundary cases

Times are Asia/Bangkok. Now is Mon 9 Nov 2026 10:00 unless stated. Slot X = advisor A's Tue 10 Nov 09:00.

| Case | Result | Verified by |
|---|---|---|
| Move X to Tue 14:00, body also has `endAt` | 200, `endAt` 14:30, same `id` | AC-F12-01 |
| Move X to Sat 14 Nov 10:00 / Tue 10:15 / Tue 07:30 / Tue 18:00 | 422 with the F-04 code, X unchanged | AC-F12-02 |
| Move X to Tue 08:00 / Tue 17:30 | 200 | AC-F12-02 |
| Move X to Mon 9 Nov 09:30 (past) | 422 `SLOT_IN_PAST` | AC-F12-02 |
| A also has Tue 10:00; move X to Tue 10:00 | 409 `SLOT_OVERLAP`, X unchanged | AC-F12-03 |
| Move X to Tue 09:00 (its own current start, the only start that overlaps its old range) | 200, `isLate` recomputed | AC-F12-03 |
| Move X to Tue 09:30 (back-to-back with its old range, no overlap) | 200 | AC-F12-03 |
| B has Tue 14:00; move X to Tue 14:00 | 200 (overlap is per advisor) | AC-F12-03 |
| A has a deleted slot at Tue 14:00; move X there | 200 | AC-F12-03 |
| X has an ACTIVE booking | 409 `SLOT_HAS_ACTIVE_BOOKING`, X and booking unchanged | AC-F12-04 |
| X's only booking is CANCELLED | 200 | AC-F12-04 |
| Now Mon 19:00, slot Wed 11 Nov 09:00 moved to Tue 10 Nov 09:00 | 200, `isLate` true, `bookingDeadline` Tue 07:00 | AC-F12-05 |
| That late slot moved back to Wed 11 Nov 09:00 | 200, `isLate` false, `bookingDeadline` Tue 18:00 | AC-F12-05 |
| Now Tue 10 Nov 07:30, slot Wed 09:00 moved to Tue 09:30 (exactly 2 h) | 422 `SLOT_UNBOOKABLE` | AC-F12-05 |
| Now Tue 07:29, same move (2 h 01 min) | 200, `isLate` true | AC-F12-05 |
| A's slot Mon 10:00 (starts now) or Mon 09:30 (in progress) | 422 `SLOT_ALREADY_STARTED` | AC-F12-06 |
| Student edits X | 403 `FORBIDDEN_ROLE` | AC-F12-07 |
| Advisor B edits X; A edits a deleted slot; unknown id | 404 `NOT_FOUND` | AC-F12-07 |
| `:id` = `abc`; body without `startAt`; `startAt` = `"tomorrow"` | 400 `VALIDATION_ERROR` | AC-F12-07 |

### 3.4 Permissions

| Caller | Allowed |
|---|---|
| Advisor, own slot | Yes, under section 3.2. |
| Advisor, another advisor's slot | No. 404 `NOT_FOUND`. |
| Student | No. 403 `FORBIDDEN_ROLE`. |
| No valid session | No. 401. |

## 4. API contract

### 4.1 Request

`PATCH /api/slots/:id`, JSON body, `sid` cookie required.

```json
{ "startAt": "2026-11-10T07:00:00.000Z" }
```

(Tue 10 Nov 2026 14:00 Asia/Bangkok.)

### 4.2 Success response

`200 OK`, the same shape as F-04 section 4.2 and one item of F-05:

```json
{
  "id": 7,
  "startAt": "2026-11-10T07:00:00.000Z",
  "endAt": "2026-11-10T07:30:00.000Z",
  "isLate": false,
  "bookingDeadline": "2026-11-10T05:00:00.000Z",
  "status": "Open",
  "student": null,
  "bookingId": null
}
```

### 4.3 Error responses

| Status | `code` | `message` | When |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | "The slot id must be a positive integer." / "A valid start time is required." | Section 3.1. |
| 401 | `UNAUTHENTICATED` | "You are not logged in." | No session. |
| 403 | `FORBIDDEN_ROLE` | "Only advisors can edit slots." | Student. |
| 404 | `NOT_FOUND` | "Slot not found." | Check 4. |
| 409 | `SLOT_HAS_ACTIVE_BOOKING` | "This slot has a booking. Cancel the booking first." | Check 6. |
| 409 | `SLOT_OVERLAP` | "This slot overlaps one of your slots." | Check 12. |
| 422 | `SLOT_ALREADY_STARTED` | "This slot has already started." | Check 5. |
| 422 | F-04 codes | F-04 messages | Checks 7 to 11. |
| 500 | `INTERNAL_ERROR` | "Something went wrong." | Unexpected. |

## 5. UI behavior

Screen `/schedule`, role advisor, the F-05 list.

| Part | Behavior |
|---|---|
| Edit button | On Open and Closed rows only. |
| Edit form | Inline in the row: weekday date picker and start-time select (08:00 to 17:30, 30-minute steps), prefilled. Save and Cancel. |
| Loading | Save disabled with a spinner while the request runs. |
| Success | The row shows the new time, status and deadline; the list is re-sorted. Short "Slot updated." message. |
| Error | A Bootstrap alert with the server's `message`; the form keeps its values. On 404 or 409 `SLOT_HAS_ACTIVE_BOOKING` the client reloads the list. |
| 401 | Go to `/login`. |

## 6. Data

| Layer | Change |
|---|---|
| Schema / migration | None. `startAt`, `endAt`, `isLate` are updated in place; the CHECK and exclusion constraints already apply to UPDATE. |
| Service | New `editSlot(advisorId, slotId, newStart, now)` in `server/src/services/slots.ts`, reusing `checkSlotStart`, `isLateSlot`, `toSlotDto` and the 23P01 mapping. |
| Route | `slotsRouter.patch("/:id", ...)`. The F-04 `MESSAGES` map gets the new codes. |
| Historical data | None to migrate. Cancelled bookings keep pointing at the slot; after an edit they show the slot's new time (accepted: a cancelled booking has no meeting to keep). |

## 7. Acceptance criteria

| AC | Criterion | Expected, observable outcome |
|---|---|---|
| AC-F12-01 | An advisor changes the start time of their own unbooked future slot; end = new start + 30 min, client end ignored. | 200 with the F-05 item shape. Same `id`. Stored `startAt`/`endAt` are the new values. |
| AC-F12-02 | The F-04 rules BR-02 and BR-03 apply to the new start. | Each bad start of section 3.3 returns 422 with its code and the row is unchanged. 08:00 and 17:30 return 200. |
| AC-F12-03 | The new time cannot overlap another of the advisor's live slots (BR-04); the slot itself does not count. | 409 `SLOT_OVERLAP` against an own live slot. 200 when it overlaps only its old range, another advisor's slot, or an own deleted slot. |
| AC-F12-04 | A slot with an ACTIVE booking cannot be edited; a cancelled booking does not block (BR-14, BR-13). | 409 `SLOT_HAS_ACTIVE_BOOKING`, nothing changes. 200 when the only booking is CANCELLED. |
| AC-F12-05 | `isLate` is recomputed for the new start as if created now (D-28). | Cases of section 3.3: late true with deadline start - 2 h; back to false with the BR-06 deadline; exactly 2 h → 422 `SLOT_UNBOOKABLE`; 2 h 01 min → 200. |
| AC-F12-06 | A slot that has started cannot be edited (D-29). | 422 `SLOT_ALREADY_STARTED` at `startAt = now` and after. |
| AC-F12-07 | Only the slot's advisor can edit it; input is validated. | Student 403; other advisor, deleted, unknown id 404; bad id or body 400. No change in any case. |

## 8. Software Test Specification (STS)

Test files: `server/tests/slots.edit.test.ts` (API). The rule functions are already unit tested in `domain.rules.test.ts` (F-04); no new unit test.

Test clock: now = **Mon 9 Nov 2026 10:00** Asia/Bangkok (`2026-11-09T03:00:00Z`) unless stated. Slot X = advisor A's Tue 10 Nov 09:00, created through the API before each test.

| TEST | AC | Level | Precondition / input | Action | Expected |
|---|---|---|---|---|---|
| TEST-F12-01 | AC-F12-01 | API | X. | A: `PATCH` X with `startAt` Tue 14:00 and `endAt` Tue 18:00. | 200, `id` = X, `endAt` Tue 14:30. DB row has the new times. |
| TEST-F12-02 | AC-F12-02 | API | X. | A: `PATCH` X to Sat 14 Nov 10:00, Tue 10:15, Tue 07:30, Tue 18:00, Mon 9 Nov 09:30; then to Tue 08:00; then Tue 17:30. | 422 `SLOT_NOT_WEEKDAY`, `SLOT_INVALID_START_MINUTE`, `SLOT_OUTSIDE_HOURS`, `SLOT_OUTSIDE_HOURS`, `SLOT_IN_PAST` (row unchanged after each); then 200, 200. |
| TEST-F12-03 | AC-F12-03 | API | X; A has Tue 10:00; B has Tue 14:00; A has a deleted Tue 15:00. | A: `PATCH` X to Tue 10:00; to Tue 09:00 (unchanged start); to Tue 14:00; to Tue 15:00. | 409 `SLOT_OVERLAP` (X unchanged); 200 (fails if the slot counts against itself); 200; 200. |
| TEST-F12-04 | AC-F12-04 | API | X with an ACTIVE booking by S; slot Y (Tue 11:00) with only a CANCELLED booking. | A: `PATCH` X to Tue 14:00; `PATCH` Y to Tue 16:00. | 409 `SLOT_HAS_ACTIVE_BOOKING` (X time and booking unchanged); 200. |
| TEST-F12-05 | AC-F12-05 | API | Now Mon 9 Nov 19:00. A has W = Wed 11 Nov 09:00 (`isLate` false). | `PATCH` W to Tue 10 Nov 09:00; then back to Wed 11 Nov 09:00. Then now = Tue 10 Nov 07:30: `PATCH` W to Tue 09:30. Then now = Tue 07:29: same. | 200 `isLate` true, deadline Tue 07:00; 200 `isLate` false, deadline Tue 18:00; 422 `SLOT_UNBOOKABLE` (row unchanged); 200 `isLate` true. |
| TEST-F12-06 | AC-F12-06 | API | A has Mon 9 Nov 09:30 and Mon 10:00 (inserted with Prisma). | `PATCH` each to Tue 15:00. | Both 422 `SLOT_ALREADY_STARTED`. |
| TEST-F12-07 | AC-F12-07 | API | X; B and S logged in; A has a deleted slot. | S `PATCH` X; B `PATCH` X; A `PATCH` the deleted slot; A `PATCH` id 999999; A `PATCH` id `abc`; A `PATCH` X with `{}`; with `{ "startAt": "tomorrow" }`. | 403; 404; 404; 404; 400; 400; 400. X unchanged. |

The race between an edit and a booking uses the same lock as F-13 and is shown by TEST-F13-07; F-12 adds no separate concurrency test.

### 8.1 TDD plan

TEST-F12-01 to -07 are written first and fail against `sprint-2` without the route (404 from Express instead of the expected codes), then `editSlot` and the route make them pass. Red and green output go to `evidence/f12-red.txt` and `evidence/f12-green.txt`.

## 9. Known limitations

- Only the start time can change; the advisor cannot move a slot to another advisor.
- A slot that becomes late through an edit sends no notification (D-28).
- Edit is offered on Closed rows, so an advisor can "edit" a Closed morning slot to the same start: by D-28 it becomes a late slot, bookable again until start - 2 h, but no student is notified. Delete + create of the same slot would notify from Sprint 3 (FR-19). The F-19 contract must decide whether an edit that makes a slot late also notifies.
- A booked slot must have its booking cancelled first (F-11), then be edited; there is no "move the booking with the slot".

## 10. Completion evidence

In the F-12 PR and Part B of the Deliverable 2 PDF: red/green runs, `npm test` counts, the PR with Chanat's review and merge into `sprint-2`, Issue #72.
