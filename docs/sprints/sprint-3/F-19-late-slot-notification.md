# F-19 Late-slot notification: Engineering Contract

| Item | Value |
|---|---|
| Feature | F-19 Late-slot notification |
| Sprint | 3 |
| Owner | Contract and implementation: Chanat Dachkhumhang (contract Issue #92, implementation Issue #116), reviewed by Jeerasak Phisawong. |
| Status | Done. TEST-F19-01 to -07 and the E2E step pass. PR #117 merged into `sprint-3` by Jeerasak after review on 2026-11-26; ships in `v1.0.0` with migration `20261126091653_add_notification`. |
| Linked requirements | FR-19, BR-16 (notification), BR-09, NFR-03 (see section 1) |
| Depends on | F-04 (single create, `isLate`), F-15 (batch create, D-30, PR #77), F-12 (edit does not notify, D-28, PR #77), F-13 (soft delete, D-29) |
| Needed by | none |
| Related documents | `docs/srs.md` (v1.0), `docs/system-sds.md` sections 3 (`Notification`, unique index), 4.1, 5.1, 6, `docs/decisions.md` (D-16, D-23, D-28, D-29, D-30, new D-32), `docs/sprints/sprint-1/F-04-create-slot.md`, `docs/sprints/sprint-2/F-15-batch-create-slots.md`, `docs/sprints/sprint-2/F-12-edit-slot.md` |

## Version history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-22 | Chanat (drafted with an AI agent) | First contract, written before implementation, on the Sprint 2 contracts in PR #76 and #77. Records D-32. Awaiting team review. |
| 0.2 | 2026-11-23 | Chanat (drafted with an AI agent) | Rebased on the released Sprint 2 (`v0.2.0-sprint-2`). The notification decision is D-32 (D-31 is now the Lab 7 BR-07 decision) and is recorded in `docs/decisions.md`. SRS reference v0.5. |
| 0.3 | 2026-11-23 | Chanat (drafted with an AI agent) | Review of PR #93: the E2E step no longer creates a late slot through the UI, because E2E runs on the real clock and a late slot exists only on a weekday morning between 18:00 the day before and start - 2 h (D-23), so the step would fail at other times. The E2E setup now inserts a late slot and its notification with Prisma; the step checks only the student's badge, `/notifications` and Mark as read. Creation, rejection (`SLOT_UNBOOKABLE`) and the transaction rule stay covered by the API tests with a fake clock. |
| 0.4 | 2026-11-26 | Chanat (drafted with an AI agent) | Status line after implementation. Section 8: all API tests are in `server/tests/notifications.test.ts` (not split into the F-04 / F-15 test files), so the three-student fixture and the per-student checks are in one place; the tests read notifications only through `GET /api/notifications`, so the red run fails on 404, not on a missing Prisma model. TEST-F19-03 adds a batch of late slots rejected inside the transaction (`SLOT_OVERLAP`), the real rollback case; the Thu 17:00 batch is rejected before the transaction. A section 3.1 case checks the 400 for a bad id. |
| 0.5 | 2026-11-26 | Chanat (drafted with an AI agent) | Final check for `v1.0.0` against the code on `sprint-3` `d12ecfd`: transaction, message text, endpoints, UI and tests match. Owner and status (Issues #92 and #116, PR #117 merged), migration name in section 6, SRS reference v1.0, section 10 evidence. No change to the contract. |

## 0. Decision D-32: what a notification shows after the slot changes

A notification is created once, when a late slot is **created** (F-04 single, or each late slot of an F-15 batch). It is never created by an edit (D-28) and never removed by a delete (D-29).

- The list shows the slot's **current** advisor, date and time (joined from `Slot`) and whether it can still be booked now (`slotAvailable`). The stored `message` is the text at creation, kept as a record.
- So if the advisor moves the slot (F-12), the notification shows the new time; if the advisor deletes it (F-13) or it is booked or its deadline passes, it shows "no longer available". No new notification is sent in these cases.
- Known gap (from the review of PR #77): moving a normal slot to a late time through F-12 does not notify, while delete + create would. Accepted: FR-19 and D-28 say "created".

Recorded as D-32 in `docs/decisions.md` (D-31 is the Lab 7 BR-07 decision).

## 1. Linked requirements

| ID | Text (short) | How F-19 meets it |
|---|---|---|
| FR-19 | When an advisor creates a late slot, every student gets an in-app notification with the advisor, date and time. A student lists their notifications and marks them as read. | F-04 and F-15 insert one `Notification` per student per late slot in the slot's transaction (section 2.1). `GET /api/notifications`, `POST /api/notifications/:id/read` (sections 2.2, 2.3). |
| BR-16 (notification) | The creation of a late slot triggers the FR-19 notification. Unbookable late slots are rejected (D-23), so they never notify. | Notifications are inserted after the slot rules pass, in the same transaction; a rejected slot or batch writes nothing (D-30 all-or-nothing). |
| BR-09 | A student sees only their own data. | Notifications are scoped by `studentId` = caller; another student's id gives 404. |
| NFR-03 | Server-side role checks. | Advisors get 403 on the notification endpoints (SDS section 6). |

## 2. Behavior and workflow

### 2.1 Creating notifications (inside F-04 and F-15)

1. F-04 or F-15 runs its rules and inserts the slot(s) as today.
2. In the **same transaction**, for each inserted slot with `isLate` true: read all users with role STUDENT and `createMany` one `Notification` per student (`studentId`, `slotId`, `message`, `createdAt` = now, `readAt` null). The unique index `Notification(studentId, slotId)` (SDS section 3) guarantees at most one per student per slot.
3. `message` = "<advisor name> added a late slot on <Tue 10 Nov> at <09:00>." (Asia/Bangkok, the SDS date format).
4. If any insert fails, the whole transaction rolls back: no slot without notifications, no notifications without a slot.
5. The F-04 / F-15 responses do not change.

Students created after the slot get no notification for it (FR-19: "when an advisor creates").

F-12 (edit) and F-13 (delete) do not create or remove notifications (D-28, D-29, D-32).

### 2.2 Listing

1. Student opens `/notifications` (or sees the unread count in the top bar).
2. `GET /api/notifications`, `requireAuth`, `requireRole("STUDENT")`.
3. Own notifications, newest first (`createdAt` desc, then id desc), each with the current slot data and `slotAvailable` (section 4.2), plus `unreadCount`.

`slotAvailable` = slot not deleted, no ACTIVE booking, and `now < bookingDeadline(slot)` (the same test as F-06's bookable list).

### 2.3 Marking as read

1. Student clicks Mark as read.
2. `POST /api/notifications/:id/read`, `requireAuth`, `requireRole("STUDENT")`.
3. Not found or not the caller's: 404. Otherwise set `readAt` = now **only if it is null** (idempotent: a second call keeps the first time).
4. 200 with the notification (section 4.2 item shape).

## 3. Validation, failures and boundaries

### 3.1 Input validation

| Field | Rule |
|---|---|
| `:id` (mark as read) | Positive integer, else 400 `VALIDATION_ERROR`. |
| Body | None. Ignored. |

### 3.2 Failure and boundary cases

| Case | Result | Verified by |
|---|---|---|
| Advisor creates a late slot (now Mon 19:00, slot Tue 10 Nov 09:00); 3 students exist | 201 (F-04); 3 notifications, one per student, same `slotId` | AC-F19-01 |
| Advisor creates a normal slot | No notification | AC-F19-01 |
| Late slot 2 h or less away | 422 `SLOT_UNBOOKABLE` (F-04), no slot and no notification | AC-F19-02 |
| Batch Tue 11:00 to 13:00 at Mon 19:00 (2 late, 2 normal, F-15 example) | 2 notifications per student (one per late slot) | AC-F19-03 |
| Batch rejected (one slot breaks a rule, D-30) | No slot, no notification | AC-F19-03 |
| Edit a normal slot to a late time (F-12) | No notification (D-28) | AC-F19-04 |
| Edit a notified slot to another time | The existing notification shows the new time; no new row | AC-F19-04 |
| Notified slot deleted, booked, or past its deadline | Still listed, `slotAvailable` false | AC-F19-05 |
| List: two notifications, one read | Newest first; `unreadCount` 1 | AC-F19-06 |
| Mark as read; mark again | `readAt` set; second call 200 with the same `readAt` | AC-F19-06 |
| Another student's notification id / unknown id | 404 `NOT_FOUND`, same body | AC-F19-07 |
| Advisor calls either endpoint | 403 `FORBIDDEN_ROLE` | AC-F19-07 |
| No session | 401 | AC-R01-01 (shared) |

### 3.3 Permissions

| Caller | List | Mark as read |
|---|---|---|
| Student | Own only | Own only, else 404 |
| Advisor | 403 ("Only students have notifications.") | 403 |
| No session | 401 | 401 |

## 4. API contract

### 4.1 Requests

- `GET /api/notifications`, no body.
- `POST /api/notifications/:id/read`, no body.

### 4.2 Success responses

`GET /api/notifications`: `200 OK`

```json
{
  "unreadCount": 1,
  "items": [
    {
      "id": 5,
      "message": "Example Advisor added a late slot on Tue 10 Nov at 09:00.",
      "createdAt": "2026-11-09T12:00:00.000Z",
      "readAt": null,
      "slot": { "id": 21, "startAt": "2026-11-10T02:00:00.000Z", "endAt": "2026-11-10T02:30:00.000Z" },
      "advisor": { "id": 1, "name": "Example Advisor" },
      "slotAvailable": true
    }
  ]
}
```

`POST /api/notifications/:id/read`: `200 OK`, one item as above with `readAt` set.

### 4.3 Error responses

| Status | `code` | `message` | When |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | "The notification id must be a positive whole number." | Bad id. |
| 401 | `UNAUTHENTICATED` | "You are not logged in." | No session. |
| 403 | `FORBIDDEN_ROLE` | "Only students have notifications." | Advisor. |
| 404 | `NOT_FOUND` | "Notification not found." | Unknown or another student's. |
| 500 | `INTERNAL_ERROR` | "Something went wrong." | Unexpected. |

No new codes.

## 5. UI behavior

| Part | Behavior |
|---|---|
| Top bar (student) | "Notifications" link with a badge showing `unreadCount` when it is more than 0. Fetched after login and when `/notifications` changes something. |
| `/notifications` | Newest first. Unread rows in bold with a Mark as read button. Each row: advisor, date and time from the current slot. If `slotAvailable`, a "Book" link to `/slots`; otherwise "This slot is no longer available." |
| Mark as read | Button disabled with a spinner while running; the row turns normal and the badge drops by one. |
| Empty | "No notifications." |
| Error | As SDS section 4.2. |

The UI renders the advisor, date and time from `slot` and `advisor` (current data, D-32), not from `message`.

## 6. Data

| Layer | Change |
|---|---|
| New model | `Notification` (SDS section 3): `id`, `studentId` (FK `User`, restrict), `slotId` (FK `Slot`, restrict), `message` (text), `createdAt` (timestamptz), `readAt` (timestamptz, null). |
| Constraint | `@@unique([studentId, slotId])` (SDS section 3, "one notification per student per late slot"). |
| Index | `@@index([studentId, createdAt])` for the newest-first list. |
| Migration | `20261126091653_add_notification` (`prisma migrate dev --name add_notification`). New table only; no backfill (existing late slots were created before F-19 and do not notify). |
| Service | `notifyLateSlots(tx, slots, now)` called from the F-04 and F-15 services inside their transaction. |
| Seed | Unchanged (seeded slots are not late). |

```prisma
model Notification {
  id        Int       @id @default(autoincrement())
  studentId Int
  student   User      @relation("StudentNotifications", fields: [studentId], references: [id], onDelete: Restrict)
  slotId    Int
  slot      Slot      @relation(fields: [slotId], references: [id], onDelete: Restrict)
  message   String
  createdAt DateTime  @db.Timestamptz(3)
  readAt    DateTime? @db.Timestamptz(3)

  @@unique([studentId, slotId])
  @@index([studentId, createdAt])
}
// in model User, add:  notifications Notification[] @relation("StudentNotifications")
// in model Slot, add:  notifications Notification[]
```

## 7. Acceptance criteria

| AC | Criterion | Expected, observable outcome |
|---|---|---|
| AC-F19-01 | Creating a late slot notifies every student once; a normal slot notifies no one. | Late slot with 3 students: 3 rows, one per student, same `slotId`, `message` names advisor, date and time, `readAt` null. Normal slot: 0 rows. |
| AC-F19-02 | A rejected late slot notifies no one (D-23). | 422 `SLOT_UNBOOKABLE`; 0 `Slot` rows and 0 `Notification` rows added. |
| AC-F19-03 | A batch notifies once per late slot per student; a rejected batch notifies no one. | Batch with 2 late of 4: 2 × (number of students) rows. Rejected batch: 0 rows. |
| AC-F19-04 | Editing never creates a notification; an edited slot's notification shows the new time (D-28, D-32). | Normal → late edit: 0 rows. Notified slot moved: still 1 row per student; `GET` shows the new `startAt`. |
| AC-F19-05 | `slotAvailable` follows the slot's state. | True for an open late slot before its deadline; false after it is booked, deleted, or past its deadline. |
| AC-F19-06 | A student lists own notifications newest first with an unread count, and marks one as read idempotently. | Order by `createdAt` desc; `unreadCount` correct; first mark sets `readAt` = now, second returns 200 with the same `readAt`; `unreadCount` drops by 1. |
| AC-F19-07 | Ownership and role. | Another student's id and an unknown id: 404 with identical bodies, no change. Advisor: 403 on both endpoints. |

## 8. Software Test Specification (STS)

Test file: `server/tests/notifications.test.ts` (API, creation cases included; v0.4). Fake clock, Asia/Bangkok, now = Mon 9 Nov 19:00 unless stated (so morning slots on Tue are late). Each test creates its own students and counts them, so the expected row count does not depend on the seed.

| TEST | AC | Level | Precondition / input | Action | Expected |
|---|---|---|---|---|---|
| TEST-F19-01 | AC-F19-01 | API | Advisor A; students S1, S2, S3 (and the count N of all students). | A creates Tue 10 Nov 09:00 (late); A creates Thu 12 Nov 10:00 (normal). | First: N rows for the slot, one per student, message "… on Tue 10 Nov at 09:00.". Second: 0 rows. |
| TEST-F19-02 | AC-F19-02 | API | Now Tue 07:00. | A creates Tue 09:00 (late, exactly 2 h). | 422 `SLOT_UNBOOKABLE`; slot and notification counts unchanged. |
| TEST-F19-03 | AC-F19-03 | API | A logged in. | Batch Tue 11:00–13:00; then a batch Thu 17:00–18:30 (rejected, F-15). Separately: A's late Tue 10:00, then a batch Tue 08:30–10:30 (three late slots, rejected `SLOT_OVERLAP` inside the transaction). | 2 × N new rows (for the 11:00 and 11:30 slots); then 0 new rows. Overlap case: 409, only the Tue 10:00 slot and its N rows. |
| TEST-F19-04 | AC-F19-04 | API | A's normal Wed 11 Nov 09:00 and a notified late Tue 10 Nov 09:00. | `PATCH` Wed → Tue 10:00 (now late); `PATCH` Tue 09:00 → Tue 11:00; S1 `GET`. | 0 new rows; S1's notification shows `startAt` Tue 11:00. |
| TEST-F19-05 | AC-F19-05 | API | Three notified late slots X, Y, Z. S1 books X; A deletes Y; Z is open. | S1 `GET` at Mon 19:30; then at Tue 07:00 (Z's deadline). | X false, Y false, Z true; then Z false. |
| TEST-F19-06 | AC-F19-06 | API | S1 has notifications n1 (older) and n2 (newer), both unread. | `GET`; `POST /read` n1 twice (second at a later time); `GET`. | n2 first, `unreadCount` 2; both POSTs 200 with the same `readAt`; `unreadCount` 1. |
| TEST-F19-07 | AC-F19-07 | API | S1's n1; S2 and A logged in. | S2 marks n1; S2 marks 999999; A calls `GET` and `POST /read`. | 404 twice with identical bodies, n1 unchanged; 403 `FORBIDDEN_ROLE` twice. |

R-01: `r01.auth.test.ts` adds both endpoints to the 401 list.

UI/E2E: one Playwright step. Setup, with Prisma from the E2E test (as the seed does): insert a late slot for Advisor One that starts in the future with `isLate` true, and one unread `Notification` for the student. Step: the student logs in, sees the unread badge, opens `/notifications`, sees the advisor, date and time, clicks Mark as read, and the badge disappears. The step does not create the slot through the UI: E2E runs on the real clock, and a late slot can be created only on a weekday morning between 18:00 the day before and start - 2 h (D-23), so a UI-created slot would make the step depend on when CI runs. Creation, the `SLOT_UNBOOKABLE` rejection (NFR-07) and the transaction rule are covered by TEST-F19-01 to TEST-F19-03 with a fake clock.

### 8.1 TDD plan

TEST-F19-01 to -07 first, red (no table and no routes: the asserted counts and statuses fail, not a compile error; the Prisma model is added in the same commit as the migration). Then the migration, `notifyLateSlots`, and the endpoints.

## 9. Known limitations

- Moving a slot to a late time with F-12 sends no notification (D-28, D-32; found in the review of PR #77).
- Students created after a late slot get no notification for it.
- No delete or "mark all as read"; not required by FR-19.

## 10. Completion evidence

- Red and green: `evidence/f19-red.txt`, `evidence/f19-green.txt`; E2E red and green: `evidence/f19-e2e-red.txt`, `evidence/f19-e2e.txt`; the migration on a clean database: `evidence/f19-migrate-clean.txt`; after the rebase on F-17: `evidence/f19-after-rebase.txt` (server 27 files, 377 passed; E2E 13 passed).
- Contract PR #93 (Issue #92), code PR #117 (author Chanat, reviewed and merged by Jeerasak), Issue #116.
- On the final `sprint-3` commit `d12ecfd` (merge of PR #117), CI run 45802912186: server 27 files, 377 passed, 0 failed, 0 skipped; E2E 13 passed.
