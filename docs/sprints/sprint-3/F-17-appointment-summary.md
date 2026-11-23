# F-17 Appointment summary: Engineering Contract

| Item | Value |
|---|---|
| Feature | F-17 Appointment summary |
| Sprint | 3 |
| Owner | Contract: Jeerasak Phisawong, reviewed by Chanat Dachkhumhang. Implementation: not planned for Deliverable 2 (contract only). |
| Status | Contract draft. Implementation not started. |
| Linked requirements | FR-17, BR-08, BR-09, NFR-03, NFR-05, NFR-07 (see section 1) |
| Depends on | F-05 (`slotStatus`, D-24 statuses), F-10 and F-11 (cancelled bookings), F-13 (soft delete keeps history, D-29), F-16 (`bangkokDay`, PR #98) |
| Needed by | none |
| Related documents | `docs/srs.md` (v0.5), `docs/features.md`, `docs/system-sds.md` sections 4.1, 5, 5.1, 6, `docs/decisions.md` (D-17, D-20, D-24, D-29, D-33), `docs/sprints/sprint-1/F-05-view-own-slots.md`, `docs/sprints/sprint-3/F-16-filter-bookable-slots.md` section 3.2 |

## Version history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-23 | Jeerasak (drafted with an AI agent) | First contract, written before implementation, on the released Sprint 2 (`v0.2.0-sprint-2`). Awaiting team review. |
| 0.2 | 2026-11-23 | Jeerasak (drafted with an AI agent) | Review of PR #100: the count definitions, `upcoming` limited to the range and the 90-day cap are recorded as D-33 (cited in the header, section 0 and section 3.1). The E2E step opens a fixed range from its URL instead of checking today's default range, so it no longer depends on the clock (a plain date on the UTC CI runner is yesterday between 00:00 and 07:00 Bangkok). TEST-F17-05 adds the object form `from[a]=`. |

## 0. What each count means

D-20 says the summary shows "counts (slots, booked, cancelled, open) plus a list of upcoming appointments". This contract, recorded as **D-33**, fixes what each one counts, over the advisor's own slots that **start** inside the range (section 3.2):

| Count | Counts | Notes |
|---|---|---|
| `slots` | Own slots in the range that are not deleted. | Deleted slots are gone from the schedule (F-13), so they are not counted as slots. |
| `booked` | Of those, the slots with an ACTIVE booking, whether the slot has ended or not. | A booked slot that has ended still was an appointment (D-17: shown as "Passed", still ACTIVE). |
| `open` | Of those, the slots that are **Open now** (D-24: future, unbooked, before the booking deadline). | The same rule as F-05 and F-06 (`slotStatus` = "Open"). |
| `cancelled` | CANCELLED **bookings** on own slots in the range, including slots deleted later. | A booking count, not a slot count: one slot can have several cancelled bookings. D-29 keeps them. A reschedule's old booking counts here (F-14). |

So `slots` = `booked` + `open` + the slots that can no longer be booked (Closed, or ended without a booking). That last group is not a separate count; FR-17 does not ask for it.

`upcoming` lists the ACTIVE bookings on own slots in the range whose slot has **not ended** (D-24 "Upcoming"), including one that has started but not ended.

## 1. Linked requirements

| ID | Text (short) | How F-17 meets it |
|---|---|---|
| FR-17 | An advisor views an appointment summary for a chosen date range: counts of slots, booked, cancelled and open, plus the list of upcoming appointments. | `GET /api/summary?from=&to=` (section 4) and the `/summary` screen (section 5). Counts as section 0. |
| BR-08 | Only advisors maintain slots, and only their own. | The summary covers only slots with `advisorId` = caller. |
| BR-09 | An advisor sees only bookings on their own slots. | The upcoming list and the cancelled count come only from the caller's slots. |
| NFR-03 | A user calling an operation for another role gets 403. | A student gets 403 `FORBIDDEN_ROLE`. |
| NFR-05 | Rule times use Asia/Bangkok. | `from` and `to` are Bangkok calendar days (`bangkokDay`, F-16 section 3.2). |
| NFR-07 | Rejections return 4xx with `code` and `message`; the UI shows the message. | A bad range gives 400 `VALIDATION_ERROR` with a readable message, shown on `/summary` (E2E step in section 8). |

## 2. Behavior and workflow

1. The advisor opens `/summary` from the top bar ("Summary"). The page reads `from` and `to` from its URL (`/summary?from=2026-11-09&to=2026-11-13`); if either is missing it uses today and today + 6 days (Bangkok) and puts them in the URL.
2. The client calls `GET /api/summary?from=<YYYY-MM-DD>&to=<YYYY-MM-DD>`.
3. `requireAuth`, then `requireRole("ADVISOR")`.
4. Validate the query (section 3.1). A bad value: 400 before any database read.
5. Read the caller's slots that start in `[start of from, end of to)` (Bangkok), with their bookings, and compute the counts of section 0 with `slotStatus(slot, hasActiveBooking, now)`.
6. Count the CANCELLED bookings on the caller's slots in the same range, deleted slots included.
7. List the upcoming appointments (section 0), sorted by slot start, then booking id.
8. 200 with the counts and the list (section 4.2).
9. Changing From or To updates the page URL and reloads at once.

"Now" is the server clock, passed in.

## 3. Validation, failures and boundaries

### 3.1 Query validation

Checked in this order; the first failure is returned.

| Rule | Bad value | Response |
|---|---|---|
| `from` and `to` are both given, each as one plain string (not twice, not `from[]=`, not `from[a]=`), each a real `YYYY-MM-DD` date (`bangkokDay` not null) | Missing, empty, `2026-02-30`, `10/11/2026`, given twice | 400 `VALIDATION_ERROR`, "from and to must be real dates written as YYYY-MM-DD." |
| `to` is on or after `from` | `from=2026-11-20&to=2026-11-10` | 400 `VALIDATION_ERROR`, "to must be on or after from." |
| The range is at most 90 days, both ends included | `from=2026-11-01&to=2027-01-30` (91 days) | 400 `VALIDATION_ERROR`, "The range can be at most 90 days." |
| Any other parameter | | Ignored. |

A one-day range (`from` = `to`) is allowed. A range in the past or the future is allowed: past slots still count, and the upcoming list is then empty or full.

The 90-day limit keeps one request small (about 13 weeks, one semester's advising); it is not a business rule from the SRS (D-33).

### 3.2 The range

`from` = F and `to` = T select slots with `bangkokDay(F).start <= startAt < bangkokDay(T).end`, that is from F 00:00 to the end of T, Bangkok time. Every slot starts between 08:00 and 17:30 local, so a slot on day T at 17:30 is in the range and one on T + 1 at 08:00 is not.

### 3.3 Failure and boundary cases

Now = Mon 9 Nov 2026 10:00 unless stated. "A" is the calling advisor.

| Case | Result | Verified by |
|---|---|---|
| A's week (section 8 setup), Mon 9 to Fri 13 Nov | `slots` 8, `booked` 3, `open` 3, `cancelled` 3; upcoming Tue 09:00 (S2) and Wed 14:00 (S1) | AC-F17-01 |
| A booked slot that has ended (Mon 08:00) | Counted in `booked`, not in `upcoming` | AC-F17-01 |
| An unbooked ended slot (Mon 09:30, ends at 10:00 = now) and a Closed slot (Mon 11:30, deadline Sun 18:00) | Counted in `slots` only | AC-F17-01 |
| A slot with a cancelled and then an active booking (Wed 14:00) | `booked` and `cancelled` each count it once | AC-F17-01 |
| A deleted slot with a cancelled booking (Thu 09:00) | Not in `slots`; its booking is in `cancelled` (D-29) | AC-F17-02 |
| One-day range Tue 10 Nov | Only Tue: `slots` 3, `booked` 1, `open` 2, `cancelled` 1, upcoming Tue 09:00 | AC-F17-02 |
| Slots on Fri 6 Nov and Mon 16 Nov (outside the range) | Not counted, not listed | AC-F17-02 |
| Now Tue 09:10 / Tue 09:30, booking on Tue 09:00 to 09:30 | In `upcoming` (started, not ended) / not in `upcoming`, still `booked` | AC-F17-03 |
| Advisor B's booked slot on Tue 10 Nov | Never in A's counts or list; B's own summary has it and none of A's | AC-F17-04 |
| A range with no slots | 200, all counts 0, `upcoming` `[]` | AC-F17-04 |
| `from`/`to` missing, empty, not a real date, twice | 400, dates message | AC-F17-05 |
| `to` before `from` | 400, order message | AC-F17-05 |
| 91 days / 90 days | 400, range message / 200 | AC-F17-05 |
| Student calls | 403 `FORBIDDEN_ROLE`, "Only advisors have an appointment summary." | AC-F17-06 |
| No session | 401 `UNAUTHENTICATED` | AC-R01-01 (shared) |

### 3.4 Permissions

| Caller | Allowed | Scope |
|---|---|---|
| Advisor | Yes | Own slots only (BR-08, BR-09) |
| Student | No. 403 `FORBIDDEN_ROLE`. | |
| No valid session | No. 401. | |

Matches SDS section 6 ("Appointment summary": advisor only, own slots).

## 4. API contract

### 4.1 Request

`GET /api/summary?from=2026-11-09&to=2026-11-13`. No body. `sid` cookie of an ADVISOR required.

### 4.2 Success response

`200 OK`:

```json
{
  "from": "2026-11-09",
  "to": "2026-11-13",
  "counts": { "slots": 8, "booked": 3, "cancelled": 3, "open": 3 },
  "upcoming": [
    {
      "id": 14,
      "slot": { "id": 9, "startAt": "2026-11-10T02:00:00.000Z", "endAt": "2026-11-10T02:30:00.000Z" },
      "student": { "id": 4, "name": "Example Student" }
    }
  ]
}
```

| Field | Notes |
|---|---|
| `from`, `to` | Echo of the validated range. |
| `counts` | Section 0. Integers, 0 or more. |
| `upcoming[].id` | The booking id; the UI links to `/bookings/:id` (F-09). |
| `upcoming[].student` | `id` and `name` only, as F-05 and F-09 show the advisor. No email. |

(Example values are placeholders.)

### 4.3 Error responses

| Status | `code` | `message` | When |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | "from and to must be real dates written as YYYY-MM-DD." | Section 3.1, first row. |
| 400 | `VALIDATION_ERROR` | "to must be on or after from." | Section 3.1, second row. |
| 400 | `VALIDATION_ERROR` | "The range can be at most 90 days." | Section 3.1, third row. |
| 401 | `UNAUTHENTICATED` | "You are not logged in." | No valid session. |
| 403 | `FORBIDDEN_ROLE` | "Only advisors have an appointment summary." | Caller is a student. |
| 500 | `INTERNAL_ERROR` | "Something went wrong." | Unexpected error. |

Format: SDS section 5. No new codes.

## 5. UI behavior

Screen `/summary` (SDS section 4.1), role: advisor. Top-bar link "Summary".

| Part | Behavior |
|---|---|
| Range | From and To date inputs, filled from the page URL; defaults today and today + 6 days (Bangkok). Changing one updates the URL and reloads at once. |
| Counts | Four labelled numbers: Slots, Booked, Cancelled, Open. |
| Upcoming | A list sorted by start: date and time, student name, and an Open link to `/bookings/:id`. Empty: "No upcoming appointments in this range." |
| Loading | A spinner while the request runs; the old numbers stay. |
| 400 | A Bootstrap alert with the server's `message` (for example `to` before `from` typed in the URL), and no numbers. The range inputs stay, so the advisor can fix them. |
| 403 / 401 | As SDS section 4.2 (a student who opens `/summary` sees the 403 message; no session goes to `/login`). |

The client does not compute the counts: the server's numbers are shown as they come.

## 6. Data

| Layer | Change |
|---|---|
| Database | No schema change and no migration. Reads `Slot` and `Booking` (with the F-10 cancel fields) and `User` (student name). |
| Query | Own slots with `startAt` in the range (index `Slot(advisorId, startAt)`), with their bookings; counts in JavaScript with `slotStatus` so they match F-05. The cancelled count is one `booking.count` over the same slots with `deletedAt` not filtered. |
| Rule function | `bangkokDay` from F-16 (no new rule function). |
| Routes | A new `summaryRouter` mounted at `/api/summary` in `app.ts`. |

## 7. Acceptance criteria

| AC | Criterion | Expected, observable outcome |
|---|---|---|
| AC-F17-01 | An advisor gets the counts of section 0 and the upcoming list for a range of their own slots. | The section 8 week gives `slots` 8, `booked` 3, `open` 3, `cancelled` 3, and `upcoming` = Tue 09:00 (S2), Wed 14:00 (S1) in that order with `id`, `slot` and `student { id, name }`. |
| AC-F17-02 | The range is Bangkok days, both ends included; deleted slots keep their cancelled bookings in the count. | One-day range Tue: the Tue numbers of section 3.3. Slots before `from` or after `to` are not counted. The deleted Thu slot is not in `slots`, its booking is in `cancelled`. |
| AC-F17-03 | `upcoming` follows D-24: an appointment is listed until its slot ends. | Tue 09:00 booking listed at Tue 09:10, not listed at Tue 09:30, and still counted in `booked` at both times. |
| AC-F17-04 | An advisor sees only their own slots; an empty range gives zeros. | A's summary has none of B's slot or booking; B's has B's only. A range with no slots: all four counts 0, `upcoming` `[]`. |
| AC-F17-05 | A bad range is rejected with the SDS error format. | Each bad case of section 3.3 gives 400 `VALIDATION_ERROR` with the matching message and no summary data; 90 days gives 200. |
| AC-F17-06 | A student cannot see a summary. | 403 `FORBIDDEN_ROLE` with "Only advisors have an appointment summary.", no data. |

## 8. Software Test Specification (STS)

Test file: `server/tests/summary.test.ts` (API, Supertest against the `_test` database). Fake clock as in F-06. Times are Asia/Bangkok. Rows are inserted with Prisma. Users from `createUsers()` (A = "Dr. Advisor One", B = "Dr. Advisor Two", S1 = "Student One") plus S2 from `createStudents`. Now = Mon 9 Nov 2026 10:00 unless stated.

Setup "A's week" (all A's slots unless stated):

| Slot | State |
|---|---|
| Mon 9 Nov 08:00 | ACTIVE booking by S1 (ended) |
| Mon 9 Nov 09:30 | no booking (ends at 10:00 = now, so Passed) |
| Mon 9 Nov 11:30 | no booking (deadline Sun 8 Nov 18:00, so Closed) |
| Tue 10 Nov 09:00 | ACTIVE booking by S2 |
| Tue 10 Nov 10:00 | no booking (Open) |
| Tue 10 Nov 11:00 | one CANCELLED booking (by S1), no active one (Open) |
| Wed 11 Nov 14:00 | one CANCELLED booking (by A, reason "Sick leave"), then an ACTIVE booking by S1 |
| Thu 12 Nov 09:00 | soft-deleted, with one CANCELLED booking (by S2) |
| Fri 13 Nov 17:30 | no booking (Open) |
| Fri 6 Nov 10:00 | ACTIVE booking by S2 (before the range) |
| Mon 16 Nov 08:00 | no booking (after the range) |
| B: Tue 10 Nov 09:00 | ACTIVE booking by S1 |

| TEST | AC | Level | Precondition / input | Action | Expected |
|---|---|---|---|---|---|
| TEST-F17-01 | AC-F17-01 | API | A's week. | A: `GET /api/summary?from=2026-11-09&to=2026-11-13`. | 200. `from`/`to` echoed. `counts` = `{ slots: 8, booked: 3, cancelled: 3, open: 3 }`. `upcoming` = [Tue 09:00 with S2, Wed 14:00 with S1], each exactly `{ id, slot: { id, startAt, endAt }, student: { id, name } }`. |
| TEST-F17-02 | AC-F17-02 | API | A's week. | A: `?from=2026-11-10&to=2026-11-10`; `?from=2026-11-12&to=2026-11-12`; `?from=2026-11-06&to=2026-11-06`. | Tue: `{ slots: 3, booked: 1, cancelled: 1, open: 2 }`, upcoming [Tue 09:00]. Thu: `{ slots: 0, booked: 0, cancelled: 1, open: 0 }`, `[]`. Fri 6: `{ slots: 1, booked: 1, cancelled: 0, open: 0 }`, `[]`. |
| TEST-F17-03 | AC-F17-03 | API | A's week. | A at Tue 09:10 and at Tue 09:30 (log in again each time): `?from=2026-11-10&to=2026-11-10`. | 09:10: upcoming [Tue 09:00]; 09:30: upcoming `[]`. `booked` 1 both times. |
| TEST-F17-04 | AC-F17-04 | API | A's week. | B: `?from=2026-11-09&to=2026-11-13`; A: `?from=2026-11-23&to=2026-11-27`. | B: `{ slots: 1, booked: 1, cancelled: 0, open: 0 }`, upcoming [B's Tue 09:00 with S1], no A slot or booking id in the body. A, empty week: all 0, `[]`. |
| TEST-F17-05 | AC-F17-05 | API | A logged in. | `?to=2026-11-13`; `?from=2026-11-09`; `?from=&to=`; `?from=2026-02-30&to=2026-03-01`; `?from=10/11/2026&to=2026-11-13`; `?from=2026-11-09&from=2026-11-10&to=2026-11-13`; `?from[]=2026-11-09&to=2026-11-13`; `?from[a]=2026-11-09&to=2026-11-13`; `?from=2026-11-20&to=2026-11-10`; `?from=2026-11-01&to=2027-01-30`; `?from=2026-11-01&to=2027-01-29`. | 400 with the dates message for the first eight, 400 with the order message for the ninth, 400 with the range message for the tenth; the body is only `error`. The last (90 days) is 200. |
| TEST-F17-06 | AC-F17-06 | API | S1 logged in. | `GET /api/summary?from=2026-11-09&to=2026-11-13`. | 403 `FORBIDDEN_ROLE`, "Only advisors have an appointment summary.", error shape only. |

R-01: `server/tests/r01.auth.test.ts` adds `GET /api/summary` to `PROTECTED` (with a valid `from` and `to`, so a 401 cannot be a 400).

UI/E2E (`e2e/tests/journey.spec.ts`): advisor1 opens `/summary?from=2026-11-09&to=2026-11-15` (a fixed range given in the URL); the From and To inputs hold those two dates, and the page shows the four labels Slots, Booked, Cancelled, Open, each with a whole number. Then it opens `/summary?from=2026-11-20&to=2026-11-10` and sees "to must be on or after from." (NFR-07). The step never computes today and checks no exact counts, so it gives the same result at any time of day, on any runner time zone, and after any earlier journey step. The default range (today to today + 6) is covered by a manual check on `/summary` with no parameters, not by E2E.

### 8.1 TDD plan (when F-17 is built)

1. Red: TEST-F17-01 to -06 and the R-01 row. The route does not exist, so every request gets the 404 of the `/api` catch-all; the tests fail on their asserted 200/400/403, not on a compile error.
2. Green: `summaryRouter` and the summary service.
3. UI and the E2E step.

## 9. Known limitations

- No paging and no export; the range is at most 90 days.
- No count of Closed or ended-unbooked slots on its own (`slots` minus `booked` minus `open` gives it).
- The upcoming list shows only the student's name; the reason of a cancelled booking is in F-18 (`/history`), not here.
- Implementation is not part of Deliverable 2 (D2 needs one built Sprint 3 feature: F-16, #75).

## 10. Completion evidence

When built: failing-then-passing runs saved as `evidence/f17-red.txt` and `evidence/f17-green.txt`, `npm test` counts, the E2E run, PR link and reviewer, the F-17 Issue.
