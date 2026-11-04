# F-09 Booking detail: Engineering Contract

| Item | Value |
|---|---|
| Feature | F-09 Booking detail |
| Sprint | 1 |
| Owner | Jeerasak Phisawong (reviewer: Chanat Dachkhumhang) |
| Status | Contract draft. Implementation not started (Issue #12). |
| Linked requirements | FR-08, FR-09, BR-09, NFR-03 (see section 1) |
| Depends on | F-07 (bookings exist); entry points F-05 (advisor) and F-08 (student) |
| Needed by | The Playwright journey (Issue #13) |
| Related documents | `docs/srs.md` (v0.4), `docs/features.md`, `docs/traceability.md`, `docs/system-sds.md` sections 4.1, 5, 6, `docs/decisions.md` (D-11, D-24, D-27), `docs/sprints/sprint-1/F-07-book-slot.md`, `docs/sprints/sprint-1/F-08-view-own-bookings.md` |

## Version history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-04 | Jeerasak (drafted with an AI agent) | First contract, written before implementation. Awaiting team review. |

## 1. Linked requirements

| ID | Text (short) | How F-09 meets it |
|---|---|---|
| FR-08 | A student opens one of their bookings' detail. | `GET /api/bookings/:id` for the booking's student (AC-F09-01). |
| FR-09 | An advisor opens the detail of a booking on one of their own slots. | The same endpoint for the slot's advisor (AC-F09-02). |
| BR-09 | A student sees only their own bookings; an advisor only bookings on their own slots. | Anyone else gets 404 (section 3.3). |
| NFR-03 | A user requesting another user's booking gets 404 with no booking data. | AC-F09-03. |
| Also relevant | SDS section 5 ("404: not found, or belongs to someone else, do not reveal it exists"), D-24 (status words) | The 404 is identical for "does not exist" and "not yours". |

## 2. Behavior and workflow

1. The student clicks a booking on `/bookings` (F-08), or is sent to `/bookings/:id` after booking (F-07). The advisor clicks a Booked slot on `/schedule` (F-05).
2. The client calls `GET /api/bookings/:id`.
3. `requireAuth` loads the user. Both roles may call the endpoint.
4. The server validates `:id` (section 3.1) and loads the booking with its slot, the slot's advisor and the student.
5. Access check (section 3.3): allowed only if the caller is the booking's student or the slot's advisor. Otherwise, and when no booking has this id, 404 `NOT_FOUND`.
6. The server responds 200 with the detail and the display status (F-08 section 3.2).

"Now" is the server clock in JavaScript.

Dependencies: F-07.

## 3. Validation, failures and boundaries

### 3.1 Input validation

| Input | Rule |
|---|---|
| `:id` | A positive integer. Anything else (`abc`, `0`, `-1`, `1.5`) returns 400 `VALIDATION_ERROR`. |

### 3.2 Failure and boundary cases

| Case | Result | Verified by |
|---|---|---|
| The booking's student | 200 with the detail | AC-F09-01 |
| The advisor who owns the slot | 200 with the same detail | AC-F09-02 |
| Another student | 404 `NOT_FOUND`, no booking data | AC-F09-03 |
| Another advisor | 404 `NOT_FOUND`, no booking data | AC-F09-03 |
| Id of a booking that does not exist | 404 `NOT_FOUND`, the same body as "not yours" | AC-F09-03 |
| Booking whose slot has ended | 200, `status` "Passed" | F-08 section 3.2 |
| Non-integer id | 400 `VALIDATION_ERROR` | AC-R02-01 (shared error shape) |
| No session | 401 `UNAUTHENTICATED` | AC-R01-01 (shared) |

### 3.3 Permissions

| Caller | Allowed |
|---|---|
| The booking's student (`booking.studentId` = session user) | Yes |
| The slot's advisor (`booking.slot.advisorId` = session user) | Yes |
| Any other student or advisor | No. 404 `NOT_FOUND` (not 403), so the booking's existence is not revealed (SDS sections 5 and 6). |
| No valid session | No. 401 `UNAUTHENTICATED`. |

The check runs on the server after loading the row. A client that hides links is not authorization (SDS section 6).

## 4. API contract

### 4.1 Request

`GET /api/bookings/:id`, no body, `sid` cookie required.

### 4.2 Success response

`200 OK`

```json
{
  "id": 12,
  "status": "Upcoming",
  "createdAt": "2026-11-09T03:00:00.000Z",
  "slot": {
    "id": 8,
    "startAt": "2026-11-10T02:30:00.000Z",
    "endAt": "2026-11-10T03:00:00.000Z"
  },
  "advisor": { "id": 1, "name": "Example Advisor" },
  "student": { "id": 3, "name": "Example Student" }
}
```

| Field | Type | Notes |
|---|---|---|
| `id` | integer | `Booking.id` |
| `status` | `"Upcoming"`, `"Passed"` or `"Cancelled"` | F-08 section 3.2 |
| `createdAt` | ISO 8601 UTC string | |
| `slot` | `{ id, startAt, endAt }` | |
| `advisor` | `{ id, name }` | |
| `student` | `{ id, name }` | No email, no other user data |

The same shape is returned by F-07 on success and by both roles here. (Example values are placeholders.)

### 4.3 Error responses

| Status | `code` | `message` | When |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | "The booking id must be a positive whole number." | Section 3.1 fails. |
| 401 | `UNAUTHENTICATED` | "You are not logged in." | No valid session. |
| 404 | `NOT_FOUND` | "Booking not found." | No such booking, or the caller may not see it. The body is identical in both cases. |
| 500 | `INTERNAL_ERROR` | "Something went wrong." | Unexpected error. |

Format: SDS section 5. No new codes.

## 5. UI behavior

Screen `/bookings/:id` (SDS section 4.1), roles: student and advisor.

| Part | Behavior |
|---|---|
| Content | Date and time (SDS format), advisor name, student name, status badge (D-24 words). |
| Back link | Student: back to `/bookings`. Advisor: back to `/schedule`. |
| After booking | When reached from F-07, a "Booking confirmed." message shows at the top. |
| Loading | A spinner while the request runs. |
| 404 | "Booking not found." with the back link. The page does not hint whether the booking exists. |
| Error | A Bootstrap alert with the server's `message`. A 401 sends the user to `/login`. |

D-27 cut line: if the Sprint 1 release is at risk, this screen is cut before the API, rules or tests, and the cut is disclosed in the release notes and Part F.

## 6. Data

| Layer | Change |
|---|---|
| Database | No schema change. Reads `Booking` (F-07), `Slot` (F-04) and `User`. |
| Migration | None. |
| Query | One query by primary key, including the slot with its advisor and the student (`id`, `name` only). |

## 7. Acceptance criteria

| AC | Criterion | Expected, observable outcome |
|---|---|---|
| AC-F09-01 | The booking's student opens its detail. | 200. Body as section 4.2 for that booking, with the right status, advisor and student. |
| AC-F09-02 | The slot's advisor opens the booking's detail. | 200. The same body as AC-F09-01. |
| AC-F09-03 | Another student or another advisor gets 404 with no booking data. | Another student and another advisor each get 404 `NOT_FOUND`. A non-existent id gets the same status and an identical body. No body contains the booking's slot, advisor or student fields. |

## 8. Software Test Specification (STS)

Test file: `server/tests/bookings.detail.test.ts` (API, Supertest against the `_test` database).

Test clock: fake `Date` as in F-01, now = Mon 9 Nov 10:00 Asia/Bangkok. Rows are inserted with Prisma. Setup for all rows: advisor A owns slot X (Tue 10 Nov 09:00); student S1 has ACTIVE booking B on X. Advisor A2 and student S2 also exist. All four are logged in.

| TEST | AC | Level | Precondition / input | Action | Expected |
|---|---|---|---|---|---|
| TEST-F09-01 | AC-F09-01 | API | Setup. | S1: `GET /api/bookings/{B.id}`. | 200. `id` = B, `status` "Upcoming", `slot.id` = X, `advisor` = `{ A.id, A.name }`, `student` = `{ S1.id, S1.name }`, no other top-level keys. |
| TEST-F09-02 | AC-F09-02 | API | Setup. | A: `GET /api/bookings/{B.id}`. | 200 and a body deep-equal to TEST-F09-01's. |
| TEST-F09-03 | AC-F09-03 | API | Setup. | S2, then A2: `GET /api/bookings/{B.id}`. Then S1: `GET /api/bookings/{B.id + 1000}` (no such booking). | All three: 404, `error.code` `NOT_FOUND`. The three bodies deep-equal each other and contain only `error`. |

UI/E2E: the Playwright journey (Issue #13) opens the booking as the student after booking, and checks the advisor sees the student's name. It adds no new TEST id to F-09.

### 8.1 TDD plan

TEST-F09-01 to -03 are written first and shown failing (no endpoint), then the endpoint makes them pass. The failing run is kept as evidence.

## 9. Known limitations (Sprint 1)

- No cancel or reschedule buttons on the detail page (Sprint 2).
- The `/bookings/:id` screen may be cut under D-27 (section 5); the API stays.

## 10. Completion evidence

Failing-then-passing run, `npm test` output with counts, PR link and reviewer, Issue link (#12). See `definition-of-done.md`.
