# F-15 Batch create slots: Engineering Contract

| Item | Value |
|---|---|
| Feature | F-15 Batch create slots |
| Sprint | 2 |
| Owner | Jeerasak Phisawong (reviewer: Chanat Dachkhumhang) |
| Status | Implemented on `feat/f15-batch-create` (Issue #74), not yet merged. |
| Linked requirements | FR-15, BR-01, BR-02, BR-03, BR-04, BR-08, BR-16 (rule), NFR-03, NFR-05, NFR-07 (see section 1) |
| Depends on | F-04 (rules, `checkSlotStart`, `toSlotDto`, 23P01 mapping) |
| Needed by | F-19 (Sprint 3: a late slot created by a batch also notifies students) |
| Related documents | `docs/srs.md` (v0.4), `docs/features.md`, `docs/system-sds.md` (v0.7) sections 3.1, 5, 6, `docs/decisions.md` (D-02, D-14, D-15, D-23, D-30), `docs/sprints/sprint-1/F-04-create-slot.md` |

## Version history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-22 | Jeerasak (drafted with an AI agent) | First contract, written before implementation. Awaiting team review (Issue #68). |
| 0.2 | 2026-11-22 | Jeerasak (drafted with an AI agent) | Review on PR #77: removed the 20-slot size rule (BR-02 already limits a batch to 20 and gives the clearer 422); a 23P01 race answers 409 with the plain F-04 message; insert with `createManyAndReturn`; past-slot note corrected (three slots, `startAt <= now`). |
| 0.3 | 2026-11-23 | Jeerasak (drafted with an AI agent) | During implementation (Issue #74): TEST-F15-07 uses 15:00 to 16:00, because 09:00 and 09:30 are demo slots of advisor 1 and would overlap; TEST-F15-05 also covers a missing `startAt` and a time without a zone (section 3.1). Status updated. No AC changes. |

## 1. Linked requirements

| ID | Text (short) | How F-15 meets it |
|---|---|---|
| FR-15 | An advisor creates several consecutive 30-minute slots for one date and time range in one action. | `POST /api/slots/batch` with `{ startAt, endAt }` (section 4). |
| BR-01 | Every slot is 30 minutes. | The server cuts the range into 30-minute slots; the range length must be a multiple of 30 minutes. |
| BR-02 | Weekday, :00/:30, 08:00 to 18:00. | `checkSlotStart` on every slot of the range. |
| BR-03 | No start in the past. | Same, `SLOT_IN_PAST`. |
| BR-04 | An advisor's slots cannot overlap. | The new slots are consecutive (never overlap each other); one query checks them against the advisor's live slots; the exclusion constraint backs it. |
| BR-08 | Only advisors create slots, and only their own. | `requireRole("ADVISOR")`; `advisorId` from the session. |
| BR-16 (rule) | Late slots. | `isLate` is computed per slot (`isLateSlot(start, now)`); a late slot 2 h or less away rejects the batch with `SLOT_UNBOOKABLE` (D-23). |
| NFR-03 | Wrong role gets 403. | Student: 403 `FORBIDDEN_ROLE`. |
| NFR-05 | Asia/Bangkok times with boundaries. | Same rule functions as F-04; range unit tests in section 8. |
| NFR-07 | SDS error shape. | Section 4.3. |

D-30: the batch is all-or-nothing.

## 2. Behavior and workflow

1. On `/schedule` the advisor switches the create form to "Several slots", picks a weekday date, a From time and a To time, and clicks Create. The form shows "This creates N slots." before sending.
2. The client converts From and To on that date to UTC ISO strings and sends `POST /api/slots/batch` with `{ startAt, endAt }`.
3. `requireAuth`, then `requireRole("ADVISOR")` (403 for a student).
4. The server validates the body and cuts the range into starts `startAt, startAt + 30 min, ...` up to `endAt` (section 3.1). The cutting is a pure function `expandRange(startAt, endAt)` in `server/src/domain/rules.ts`.
5. For each start in time order the server runs `checkSlotStart(start, now)` (F-04 rules 1 to 5). The first failure rejects the whole batch (D-30); the message ends with the failing slot's local time.
6. Inside one transaction the server looks for any live slot of the advisor (`deletedAt` null) that overlaps `[startAt, endAt)`. If one exists, 409 `SLOT_OVERLAP`, naming the first new slot that overlaps. Otherwise it inserts all rows in one call that returns them (`createManyAndReturn`, Prisma 5.22; plain `createMany` returns only a count) with `advisorId` from the session, `createdAt = now` and each slot's own `isLate`.
7. If the exclusion constraint fires (a parallel create), the transaction rolls back and the answer is 409 `SLOT_OVERLAP` with the plain F-04 message "This slot overlaps one of your slots." and no "(slot at HH:MM)" suffix, because the 23P01 error does not say which slot clashed. No row of the batch remains.
8. The server responds 201 with `{ "slots": [...] }`, sorted by start. The client adds them to the list.

"Now" is the server clock, as in F-04. A batch of one slot is allowed and behaves like F-04 with the batch response shape.

## 3. Validation, failures and boundaries

### 3.1 Input validation (400 `VALIDATION_ERROR`, no database access)

| Field / rule | Rejected when |
|---|---|
| `startAt`, `endAt` | Missing, or not an ISO 8601 string with a time zone that parses to a valid instant (F-04 parser). |
| Order | `endAt <= startAt`. |
| Length | `endAt - startAt` is not a whole multiple of 30 minutes. |
| One date | `local(startAt)` and `local(endAt)` are on different calendar dates (Asia/Bangkok). |
| Any other field | Ignored. |

### 3.2 Rule checks

| # | Rule | Rejected when | Response |
|---|---|---|---|
| 1 to 5 | F-04 rules 1 to 5 on each slot in time order | as F-04 section 3.2 | 422 with the F-04 code: `SLOT_NOT_WEEKDAY`, `SLOT_INVALID_START_MINUTE`, `SLOT_OUTSIDE_HOURS`, `SLOT_IN_PAST`, `SLOT_UNBOOKABLE` |
| 6 | BR-04 | any slot of the range overlaps a live slot of the advisor | 409 `SLOT_OVERLAP` |

Message format: the F-04 message, then ` (slot at HH:MM)` in Asia/Bangkok time. Example: "Slots must be between 08:00 and 18:00. (slot at 18:00)".

Because each slot is checked in order, the first failing slot decides. For example, on a weekday with a start at :15 the first slot already fails `SLOT_INVALID_START_MINUTE`.

### 3.3 Failure and boundary cases

Times are Asia/Bangkok. Now is Mon 9 Nov 2026 10:00 unless stated.

| Case | Result | Verified by |
|---|---|---|
| Tue 10 Nov 09:00 to 11:00 | 201, 4 slots 09:00, 09:30, 10:00, 10:30, each 30 min | AC-F15-01 |
| Tue 08:00 to 18:00 | 201, 20 slots | AC-F15-01 |
| Tue 09:00 to 09:30 | 201, 1 slot | AC-F15-01 |
| Tue 17:00 to 18:30 | 422 `SLOT_OUTSIDE_HOURS` (slot at 18:00), no rows | AC-F15-02 |
| Tue 07:30 to 09:00 | 422 `SLOT_OUTSIDE_HOURS` (slot at 07:30), no rows | AC-F15-02 |
| Sat 14 Nov 09:00 to 10:00 | 422 `SLOT_NOT_WEEKDAY`, no rows | AC-F15-02 |
| Tue 09:15 to 10:15 | 422 `SLOT_INVALID_START_MINUTE`, no rows | AC-F15-02 |
| Tue 07:00 to 18:00 (22 slots, more than a day holds) | 422 `SLOT_OUTSIDE_HOURS` (slot at 07:00), no rows; there is no separate size rule, BR-02 limits a batch to 20 | AC-F15-02 |
| Mon 9 Nov 09:00 to 11:00 (09:00, 09:30 and 10:00 are past, since `startAt <= now` counts as past) | 422 `SLOT_IN_PAST` (slot at 09:00), no rows | AC-F15-02 |
| A has Tue 10:00; batch Tue 09:00 to 11:00 | 409 `SLOT_OVERLAP` (slot at 10:00), A still has only Tue 10:00 | AC-F15-03 |
| A has Tue 08:30 and 11:00; batch Tue 09:00 to 11:00 | 201 (back-to-back on both sides) | AC-F15-03 |
| B has Tue 09:00; A batches Tue 09:00 to 10:00 | 201 (overlap is per advisor) | AC-F15-03 |
| A has a deleted Tue 09:00; batch Tue 09:00 to 10:00 | 201 | AC-F15-03 |
| Now Mon 19:00; batch Tue 11:00 to 13:00 | 201; `isLate` true, true, false, false (morning deadlines Mon 18:00 passed; afternoon deadlines Tue 10:00/10:30 not) | AC-F15-04 |
| Now Tue 10 Nov 07:00; batch Tue 09:00 to 10:00 | 422 `SLOT_UNBOOKABLE` (slot at 09:00, exactly 2 h), no rows | AC-F15-04 |
| Now Tue 06:59; same batch | 201, both `isLate` true | AC-F15-04 |
| `endAt` = `startAt`; `endAt` before `startAt`; 45-minute range; range ending 00:00 next day; missing `endAt` | 400 `VALIDATION_ERROR` | AC-F15-05 |
| Student calls the endpoint | 403 `FORBIDDEN_ROLE`, no rows | AC-F15-06 |
| No session | 401 | AC-R01-01 (shared) |

### 3.4 Permissions

| Caller | Allowed |
|---|---|
| Advisor | Yes. Every slot belongs to the logged-in advisor. |
| Student | No. 403 `FORBIDDEN_ROLE`. |
| No valid session | No. 401. |

## 4. API contract

### 4.1 Request

`POST /api/slots/batch`, JSON body, `sid` cookie required.

```json
{ "startAt": "2026-11-10T02:00:00.000Z", "endAt": "2026-11-10T04:00:00.000Z" }
```

(Tue 10 Nov 2026, 09:00 to 11:00 Asia/Bangkok.)

### 4.2 Success response

`201 Created`

```json
{
  "slots": [
    { "id": 21, "startAt": "2026-11-10T02:00:00.000Z", "endAt": "2026-11-10T02:30:00.000Z", "isLate": false, "bookingDeadline": "2026-11-09T11:00:00.000Z", "status": "Open", "student": null, "bookingId": null },
    { "id": 22, "startAt": "2026-11-10T02:30:00.000Z", "endAt": "2026-11-10T03:00:00.000Z", "isLate": false, "bookingDeadline": "2026-11-09T11:00:00.000Z", "status": "Open", "student": null, "bookingId": null },
    { "id": 23, "startAt": "2026-11-10T03:00:00.000Z", "endAt": "2026-11-10T03:30:00.000Z", "isLate": false, "bookingDeadline": "2026-11-09T11:00:00.000Z", "status": "Open", "student": null, "bookingId": null },
    { "id": 24, "startAt": "2026-11-10T03:30:00.000Z", "endAt": "2026-11-10T04:00:00.000Z", "isLate": false, "bookingDeadline": "2026-11-09T11:00:00.000Z", "status": "Open", "student": null, "bookingId": null }
  ]
}
```

Each item has the F-04 section 4.2 shape. Ids are not guaranteed to be consecutive.

### 4.3 Error responses

| Status | `code` | `message` | When |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | "Choose a start and end time on one day, in 30-minute steps." | Section 3.1. |
| 401 | `UNAUTHENTICATED` | "You are not logged in." | No session. |
| 403 | `FORBIDDEN_ROLE` | "Only advisors can create slots." | Student. |
| 409 | `SLOT_OVERLAP` | "This slot overlaps one of your slots. (slot at HH:MM)" | Rule 6. |
| 409 | `SLOT_OVERLAP` | "This slot overlaps one of your slots." (no suffix) | Exclusion constraint fired on a parallel create (step 7). |
| 422 | F-04 codes | F-04 message + " (slot at HH:MM)" | Rules 1 to 5. |
| 500 | `INTERNAL_ERROR` | "Something went wrong." | Unexpected. |

No new error codes.

## 5. UI behavior

Screen `/schedule`, role advisor, the F-04 create form.

| Part | Behavior |
|---|---|
| Mode switch | "One slot" (F-04, default) / "Several slots". |
| Several slots form | Weekday date picker, From select (08:00 to 17:30), To select (08:30 to 18:00), both in 30-minute steps. To must be after From (client check). A line "This creates N slots." |
| Loading | Create disabled with a spinner. |
| Success | "N slots created." All new slots appear in the list without a reload. |
| Error | A Bootstrap alert with the server's `message` (it names the failing slot). The form keeps its values. Nothing was created. |
| 401 | Go to `/login`. |

## 6. Data

| Layer | Change |
|---|---|
| Schema / migration | None. Same `Slot` table and constraints as F-04. |
| Domain | New pure `expandRange(startAt, endAt): Date[] \| null` in `rules.ts` (null when the section 3.1 order, length or one-date rule fails; no size limit, a one-date range has at most 48 starts). |
| Service | New `createSlotBatch(advisorId, startAt, endAt, now)` in `server/src/services/slots.ts`, reusing `checkSlotStart`, `isLateSlot`, `toSlotDto` and the 23P01 mapping. |
| Route | `slotsRouter.post("/batch", ...)`, registered before any `/:id` route. |
| Notifications | None in Sprint 2. F-19 (Sprint 3) will create notifications for the late slots of a batch in the same transaction. |

## 7. Acceptance criteria

| AC | Criterion | Expected, observable outcome |
|---|---|---|
| AC-F15-01 | An advisor creates consecutive 30-minute slots for one date and time range in one action. | 201 with one slot per 30 minutes from `startAt` to `endAt`, sorted. That many `Slot` rows with `advisorId` = the advisor. They appear in `GET /api/slots/mine`. |
| AC-F15-02 | If any slot of the range breaks BR-02 or BR-03, the whole batch is rejected (D-30). | 422 with the code of the first failing slot, the message names its time, and no row is created. |
| AC-F15-03 | If any slot overlaps one of the advisor's live slots, the whole batch is rejected (BR-04). | 409 `SLOT_OVERLAP` naming the slot, no new rows. Back-to-back slots, another advisor's slots and own deleted slots do not block. |
| AC-F15-04 | Each slot gets its own `isLate`; a late slot starting 2 h or less from now rejects the batch (BR-16, D-23). | Mixed batch: correct `isLate` per slot. Exactly 2 h: 422 `SLOT_UNBOOKABLE`, no rows. 2 h 01 min: 201. |
| AC-F15-05 | An invalid range is rejected before any rule check. | 400 `VALIDATION_ERROR` for each case of section 3.1, no rows. |
| AC-F15-06 | A student cannot batch-create slots. | 403 `FORBIDDEN_ROLE`, no rows. |

## 8. Software Test Specification (STS)

Test files: `server/tests/slots.batch.test.ts` (API), `server/tests/domain.rules.test.ts` (unit, `expandRange`). E2E: the Playwright suite.

Test clock: now = **Mon 9 Nov 2026 10:00** Asia/Bangkok (`2026-11-09T03:00:00Z`) unless stated.

| TEST | AC | Level | Precondition / input | Action | Expected |
|---|---|---|---|---|---|
| TEST-F15-01 | AC-F15-01 | API | Advisor A logged in. | `POST /batch` Tue 10 Nov 09:00 to 11:00; then Wed 11 Nov 08:00 to 18:00; then Thu 12 Nov 09:00 to 09:30. | 201 with 4, 20 and 1 slots, starts as in section 3.3. DB has 25 rows for A. `GET /api/slots/mine` lists all 25. |
| TEST-F15-02 | AC-F15-02 | API | A logged in, no slots. | `POST /batch` with Tue 17:00-18:30, Tue 07:30-09:00, Tue 07:00-18:00, Sat 14 Nov 09:00-10:00, Tue 09:15-10:15, Mon 9 Nov 09:00-11:00. | 422 `SLOT_OUTSIDE_HOURS` "(slot at 18:00)", `SLOT_OUTSIDE_HOURS` "(slot at 07:30)", `SLOT_OUTSIDE_HOURS` "(slot at 07:00)", `SLOT_NOT_WEEKDAY`, `SLOT_INVALID_START_MINUTE`, `SLOT_IN_PAST` "(slot at 09:00)". `Slot` count stays 0. |
| TEST-F15-03 | AC-F15-03 | API | A has Tue 10:00; then (fresh data) A has Tue 08:30 and 11:00; B has Tue 09:00; A has a deleted Wed 09:00. | A: batch Tue 09:00-11:00 (first data). Then with the second data: A batch Tue 09:00-11:00; A batch Wed 09:00-10:00. | 409 `SLOT_OVERLAP` "(slot at 10:00)", A still has 1 slot. Then 201 (4 slots), 201 (2 slots). |
| TEST-F15-04 | AC-F15-04 | API | Advisors A and B logged in, no slots. | Now Mon 19:00: A batch Tue 11:00-13:00. Now Tue 10 Nov 07:00: B batch Tue 09:00-10:00. Now Tue 06:59: B batch Tue 09:00-10:00 again. | 201 with `isLate` [true, true, false, false]. Then 422 `SLOT_UNBOOKABLE` "(slot at 09:00)", no rows for B. Then 201, both `isLate` true. |
| TEST-F15-05 | AC-F15-05 | Unit + API | A logged in. | Unit: `expandRange` with 09:00-11:00 (4 starts), 09:00-09:00, 11:00-09:00, 09:00-09:45, Tue 23:30-Wed 00:00, and Tue 07:00-18:00. API: the bad ranges (not 07:00-18:00, which is in TEST-F15-02), and a body without `endAt`. | Unit: 4 starts, null for each of the next four, 22 starts for 07:00-18:00 (no size rule). API: 400 `VALIDATION_ERROR` each, `Slot` count unchanged. |
| TEST-F15-06 | AC-F15-06 | API | Student S logged in. | `POST /batch` Tue 09:00-10:00. | 403 `FORBIDDEN_ROLE`, `Slot` count unchanged. |
| TEST-F15-07 | AC-F15-01 | E2E | Seeded advisor 1. | `/schedule`, "Several slots", a weekday 5 days ahead, 15:00 to 16:00 (advisor 1's demo slots are 09:00, 09:30 and 14:00), Create. Reload. | "2 slots created."; both rows are in the list after reload. |

### 8.1 TDD plan

TEST-F15-01 to -06 are written first and run against `sprint-2`: the API tests fail with Express 404 (no route), which is the missing behavior. For the unit part, `expandRange` is first committed as a stub that returns `null`, so its tests fail on assertions and not on a missing import (Lab 7 rule: a compile error is not red evidence). `expandRange`, `createSlotBatch` and the route make them pass. Red and green output go to `evidence/f15-red.txt` and `evidence/f15-green.txt`.

## 9. Known limitations

- One date per batch; no repeating weekly pattern.
- No partial success: one bad slot rejects the batch (D-30).
- No notification for late slots until F-19 (Sprint 3).

## 10. Completion evidence

In the F-15 PR and Part B of the Deliverable 2 PDF: red/green runs, `npm test` counts, the PR with Chanat's review and merge into `sprint-2`, Issue #74.
