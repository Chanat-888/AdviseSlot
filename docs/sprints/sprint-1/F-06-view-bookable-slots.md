# F-06 View bookable slots: Engineering Contract

| Item | Value |
|---|---|
| Feature | F-06 View bookable slots |
| Sprint | 1 |
| Owner | Contract: Jeerasak Phisawong (reviewer: Chanat Dachkhumhang). Implementation: Chanat (Issue #11), reviewed by Jeerasak. |
| Status | Contract draft. Implementation not started (Issue #11). |
| Linked requirements | FR-06, BR-06, BR-09, BR-16 (rule), NFR-03, NFR-05 (see section 1). NFR-10 is measured in Sprint 3. |
| Depends on | F-04 (slots exist) |
| Needed by | F-07 (the student books from this list) |
| Related documents | `docs/srs.md` (v0.4), `docs/features.md`, `docs/traceability.md`, `docs/system-sds.md` sections 4.1, 4.2, 5, 6, `docs/sprints/sprint-1/F-04-create-slot.md` (section 3.3) |

## Version history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-04 | Jeerasak (drafted with an AI agent) | First contract, written before implementation. Awaiting team review. |

## 1. Linked requirements

| ID | Text (short) | How F-06 meets it |
|---|---|---|
| FR-06 | A student lists all currently bookable slots of all advisors, with advisor name, start, end and booking deadline. | `GET /api/slots/bookable` (section 4). |
| BR-06 | Booking closes at 18:00 the previous day (morning) or 2 hours before start (afternoon). | A slot at or past its deadline is not listed. |
| BR-16 (rule) | A late slot stays bookable until 2 hours before its start. | `bookingDeadline(slot)` from F-04 section 3.3 handles both cases. |
| BR-09 | The bookable list never reveals who booked a slot. | Booked slots are excluded, and the response has no student fields at all. |
| NFR-03 | A user calling an operation for another role gets 403. | An advisor gets 403 `FORBIDDEN_ROLE` (AC-F06-04). |
| NFR-05 | Rule times use Asia/Bangkok, including boundaries. | Deadline boundary tests (section 8). |
| Later | NFR-10 (p95 under 500 ms with 1,000 slots) | Measured in Sprint 3 on GCP. Section 6 adds the index it needs. |

## 2. Behavior and workflow

1. The student opens `/slots` (also the landing page after login, F-03).
2. The client calls `GET /api/slots/bookable`.
3. `requireAuth`, then `requireRole("STUDENT")`.
4. The server selects slots of all advisors that are bookable now: `deletedAt` null, no ACTIVE booking, and `now < bookingDeadline(slot)` (section 3.2).
5. The server responds 200 with the list sorted by `startAt` ascending, each item with the advisor's name and the deadline.
6. The client shows them grouped by date, each with a Book button (F-07).

"Now" is the server clock in JavaScript, never the database `now()`.

Dependencies: F-04.

## 3. Validation, failures and boundaries

### 3.1 Input

No body. No query parameters in Sprint 1 (filters by advisor and date are F-16, Sprint 3). The only input is the `sid` cookie.

### 3.2 Which slots are bookable

A slot is listed exactly when its status (F-05 section 3.2) is **Open**:

- `deletedAt` is null,
- it has no ACTIVE booking,
- `now < bookingDeadline(slot)`, where `bookingDeadline` is the normal BR-06 deadline, or `startAt - 2 h` for a late slot (F-04 section 3.3).

Because every deadline is before `startAt`, a listed slot has not started and has not ended.

The filter can be done in SQL (`isLate`, `startAt` and the deadline formula) or by loading future unbooked slots and filtering with `bookingDeadline` in JavaScript. Either way it must call the same rule as F-07, so the list and the booking check never disagree.

### 3.3 Failure and boundary cases

| Case | Result | Verified by |
|---|---|---|
| Open slots of two advisors | Both advisors' slots listed with advisor name, start, end, deadline | AC-F06-01 |
| Booked slot | Not listed | AC-F06-02 |
| Slot that has ended | Not listed | AC-F06-02 |
| Morning slot Tue 09:00, now Mon 17:59:59 | Listed | AC-F06-02 |
| Morning slot Tue 09:00, now Mon 18:00:00 | Not listed | AC-F06-02 |
| Afternoon slot Tue 14:00, now Tue 11:59:59 / 12:00:00 | Listed / not listed | AC-F06-02 |
| Late slot Tue 09:00 (created Mon 19:00), now Tue 06:59:59 / 07:00:00 | Listed / not listed | AC-F06-02 |
| Response content | No student id, name or email; no booking id | AC-F06-03 |
| No bookable slots | 200 with `[]` | Empty state (section 5) |
| Advisor calls the endpoint | 403 `FORBIDDEN_ROLE` | AC-F06-04 |
| No session | 401 `UNAUTHENTICATED` | AC-R01-01 (shared) |

### 3.4 Permissions

| Caller | Allowed |
|---|---|
| Student | Yes. Open slots of all advisors (D-03: a student may book any advisor). |
| Advisor | No. 403 `FORBIDDEN_ROLE`. |
| No valid session | No. 401 `UNAUTHENTICATED`. |

Matches SDS section 6 ("View bookable slots": student only, without booker identity).

## 4. API contract

### 4.1 Request

`GET /api/slots/bookable`, no body, `sid` cookie required.

### 4.2 Success response

`200 OK`, an array sorted by `startAt` ascending.

```json
[
  {
    "id": 8,
    "startAt": "2026-11-10T02:30:00.000Z",
    "endAt": "2026-11-10T03:00:00.000Z",
    "isLate": false,
    "bookingDeadline": "2026-11-09T11:00:00.000Z",
    "advisor": { "id": 1, "name": "Example Advisor" }
  }
]
```

| Field | Type | Notes |
|---|---|---|
| `id` | integer | `Slot.id`, sent as `slotId` to F-07 |
| `startAt`, `endAt` | ISO 8601 UTC string | |
| `isLate` | boolean | Lets the UI label a late slot |
| `bookingDeadline` | ISO 8601 UTC string | F-04 section 3.3 |
| `advisor` | `{ id, name }` | No advisor email |

The items have no `status`, `student` or `bookingId` field: every listed slot is Open, and booker data must never be in this response (BR-09). (Example values are placeholders.)

### 4.3 Error responses

| Status | `code` | `message` | When |
|---|---|---|---|
| 401 | `UNAUTHENTICATED` | "You are not logged in." | No valid session. |
| 403 | `FORBIDDEN_ROLE` | "Only students can view bookable slots." | Caller is an advisor. |
| 500 | `INTERNAL_ERROR` | "Something went wrong." | Unexpected error. |

Format: SDS section 5. No new codes.

## 5. UI behavior

Screen `/slots` (SDS section 4.1), role: student.

| Part | Behavior |
|---|---|
| List | Slots grouped by date. Each row: advisor name, time (`Wed 4 Nov 2026, 14:00-14:30` format, SDS section 4.2), "Book by" with the deadline in local time, and a Book button (F-07). A late slot shows a "Late slot" label. |
| Loading | A spinner while the request runs. |
| Empty | "No bookable slots right now." (SDS section 4.2) |
| Error | A Bootstrap alert with the server's `message`. A 401 sends the user to `/login`. |
| After booking | The list reloads, so the booked slot disappears (F-07). |

## 6. Data

| Layer | Change |
|---|---|
| Database | No new model. Reads `Slot` (F-04), `Booking` (F-07) and `User` (advisor name). |
| Index | `@@index([startAt])` on `Slot`, added with this feature, so the list stays fast at 1,000 slots (NFR-10, measured in Sprint 3). |
| Migration | Only the index, if it is not already in the F-04 migration. |

Until F-07 merges there are no bookings, so the "no ACTIVE booking" part has nothing to exclude. TEST-F06-02 inserts the booking row directly with Prisma once `Booking` exists.

## 7. Acceptance criteria

| AC | Criterion | Expected, observable outcome |
|---|---|---|
| AC-F06-01 | Student sees bookable slots of all advisors with advisor name, start, end and deadline. | 200. Open slots of both seeded advisors appear, sorted by `startAt`, each with `advisor.name`, `startAt`, `endAt` and `bookingDeadline`. |
| AC-F06-02 | Booked slots, past slots and slots past their deadline are excluded; a late slot stays listed until 2 h before start. | Each boundary in section 3.3 gives the listed or not-listed result shown. |
| AC-F06-03 | The bookable-slot response contains no booker identity. | No item has a key `student`, `studentId`, `bookingId` or `status`, and the raw body contains no student's email or name, even when other slots of the same advisor are booked. |
| AC-F06-04 | An advisor requesting the bookable-slot list gets 403. | 403 `FORBIDDEN_ROLE` and no slot data. |

## 8. Software Test Specification (STS)

Test file: `server/tests/slots.bookable.test.ts` (API, Supertest against the `_test` database). The deadline function itself is unit tested in `server/tests/domain.rules.test.ts` (F-04, F-07).

Test clock: fake `Date` as in F-01. Times are Asia/Bangkok. Rows are inserted with Prisma.

| TEST | AC | Level | Precondition / input | Action | Expected |
|---|---|---|---|---|---|
| TEST-F06-01 | AC-F06-01 | API | Now = Mon 9 Nov 10:00. Advisor A has Tue 10 Nov 09:30, advisor B has Tue 10 Nov 09:00 (both Open). Student logged in. | `GET /api/slots/bookable`. | 200. Two items, B's first (earlier start). Each has `advisor.name` of its advisor, `startAt`, `endAt` and `bookingDeadline` (Mon 18:00). |
| TEST-F06-02 | AC-F06-02 | API | Advisor A has: Tue 09:00 Open, Tue 09:30 with an ACTIVE booking, Fri 6 Nov 10:00 (ended), Tue 14:00 Open, and a late slot Wed 11 Nov 09:00 created Tue 10 Nov 19:00 (`isLate` true). | `GET` at: Mon 17:59:59, Mon 18:00:00, Tue 11:59:59, Tue 12:00:00, Wed 06:59:59, Wed 07:00:00. | The booked and the ended slot are never listed. Tue 09:00: listed at Mon 17:59:59, not at Mon 18:00:00. Tue 14:00: listed at Tue 11:59:59, not at Tue 12:00:00. Late slot: listed at Wed 06:59:59, not at Wed 07:00:00. |
| TEST-F06-03 | AC-F06-03 | API | Advisor A has one Open slot and one slot booked by student S2. Student S1 logged in. | `GET /api/slots/bookable`. | Only the Open slot. No item has `student`, `studentId`, `bookingId` or `status`. The response text does not contain S2's name or email. |
| TEST-F06-04 | AC-F06-04 | API | Advisor logged in. | `GET /api/slots/bookable`. | 403 `FORBIDDEN_ROLE`, error shape only. |

UI/E2E: the Playwright journey (Issue #13) checks that the student sees the advisor's new slot on `/slots`. It adds no new TEST id to F-06.

### 8.1 TDD plan

TEST-F06-01 to -04 are written first and shown failing (no endpoint), then the endpoint makes them pass. The failing run is kept as evidence.

## 9. Known limitations (Sprint 1)

- No filters (F-16, Sprint 3) and no paging.
- NFR-10 (p95 under 500 ms with 1,000 slots) is measured in Sprint 3, not here.

## 10. Completion evidence

Failing-then-passing run, `npm test` output with counts, PR link and reviewer, Issue link (#11). See `definition-of-done.md`.
