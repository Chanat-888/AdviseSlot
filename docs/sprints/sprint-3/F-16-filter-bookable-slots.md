# F-16 Filter bookable slots: Engineering Contract

| Item | Value |
|---|---|
| Feature | F-16 Filter bookable slots |
| Sprint | 3 |
| Owner | Contract and implementation: Jeerasak Phisawong (Issue #75), reviewed by Chanat Dachkhumhang. |
| Status | Contract draft. Implementation not started. |
| Linked requirements | FR-16, FR-06, BR-06, BR-09, BR-16 (rule), NFR-03, NFR-05, NFR-07 (see section 1) |
| Depends on | F-06 (`GET /api/slots/bookable`, the list being filtered), F-14 (`/slots?reschedule=:id` uses the same page) |
| Needed by | none |
| Related documents | `docs/srs.md` (v0.5), `docs/features.md`, `docs/system-sds.md` sections 4.1, 5, 5.1, 6, `docs/sprints/sprint-1/F-06-view-bookable-slots.md`, `docs/sprints/sprint-2/F-14-reschedule.md` section 5 |

## Version history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-23 | Jeerasak (drafted with an AI agent) | First contract, written before implementation, on the released Sprint 2 (`v0.2.0-sprint-2`). Awaiting team review. |
| 0.2 | 2026-11-23 | Jeerasak (drafted with an AI agent) | Review of PR #94: a query value that is not one plain string (given twice, `advisorId[]=1`, `date[a]=...`, which Express parses into an array or object) is 400, since `parseId` would read `["1"]` as `"1"`; TEST-F16-04 adds those cases. The E2E step asserts at least one row after each filter, so it cannot pass on an empty list. TEST-F16-06 names the exact advisor order (the API tests use `createUsers()`, not the seed). |

## 1. Linked requirements

| ID | Text (short) | How F-16 meets it |
|---|---|---|
| FR-16 | A student filters bookable slots by advisor and by date. | Two optional query parameters on the F-06 endpoint, `advisorId` and `date` (section 4), and an advisor list for the filter, `GET /api/advisors` (SDS section 5.1). |
| FR-06 | A student lists all currently bookable slots of all advisors. | With no filter the response is exactly the F-06 list. A filter only removes items; it never adds one. |
| BR-06, BR-16 (rule) | Booking deadlines; a late slot is bookable until 2 h before start. | The filters are applied on top of the F-06 rule (`now < bookingDeadline(slot)`), so a slot past its deadline is never listed, filtered or not. |
| BR-09 | The bookable-slot list never reveals who booked a slot. | Same item shape as F-06: no `student`, `studentId`, `bookingId` or `status`. `GET /api/advisors` returns only `id` and `name`. |
| NFR-03 | A user calling an operation for another role gets 403. | Both endpoints are STUDENT only. |
| NFR-05 | Rule times use Asia/Bangkok. | `date` is a Bangkok calendar date: 00:00 to 24:00 at UTC+7 (section 3.2). |
| NFR-07 | Rejections return 4xx with `code` and `message`; the UI shows the message. | A bad filter value gives 400 `VALIDATION_ERROR` with a readable message, shown on `/slots` (section 5, E2E step in section 8). |

## 2. Behavior and workflow

1. The student opens `/slots`. Above the list there is a filter bar: an Advisor select ("All advisors" plus each advisor) and a Date input, with a Clear filters link.
2. On first load the client calls `GET /api/advisors` (for the select) and `GET /api/slots/bookable` with the filters taken from the page URL (`/slots?advisor=<id>&date=<YYYY-MM-DD>`).
3. When the student changes a filter, the client updates the page URL (so a reload or the Back button keeps the filters) and calls `GET /api/slots/bookable?advisorId=<id>&date=<YYYY-MM-DD>` with only the filters that are set.
4. Server, `GET /api/slots/bookable`:
   1. `requireAuth`, then `requireRole("STUDENT")` (as F-06).
   2. Validate the query (section 3.1). A bad value: 400 `VALIDATION_ERROR` before any database read.
   3. Select the slots that are bookable now (F-06 section 3.2) **and** match every filter given: `advisorId` = the value, and `startAt` inside the Bangkok day of `date` (section 3.2).
   4. 200 with the list sorted by `startAt` ascending, same item shape as F-06.
5. Server, `GET /api/advisors`: `requireAuth`, `requireRole("STUDENT")`, then every user with role ADVISOR as `{ id, name }`, sorted by `name`, then `id`. Advisors with no open slots are included, so the select does not change as slots are booked.
6. In reschedule mode (`/slots?reschedule=:id`, F-14) the filter bar works the same way and the `reschedule` parameter is kept when filters change.

The filters are an exact match on the advisor and one calendar day. There is no date range, no text search and no time-of-day filter (section 9).

"Now" is the server clock, as in F-06.

## 3. Validation, failures and boundaries

### 3.1 Query validation (`GET /api/slots/bookable`)

| Parameter | Rule | Bad value |
|---|---|---|
| `advisorId` | Optional. A positive whole number in plain digits that fits the INT column, the same rule as `:id` (`parseId`, `server/src/routes/ids.ts`). | 400 `VALIDATION_ERROR`, "The advisor filter must be a positive whole number." |
| `date` | Optional. `YYYY-MM-DD` with a real calendar date (`2026-02-30` and `2026-13-01` are bad). | 400 `VALIDATION_ERROR`, "The date filter must be a real date written as YYYY-MM-DD." |
| Either, as anything other than one plain string: given twice (`?date=a&date=b`), with brackets (`?advisorId[]=1`), or as an object (`?date[a]=2026-11-10`) | Not allowed. Express parses these into an array or an object, so the route checks `typeof value === "string"` before `parseId` or `bangkokDay` (`parseId` would read `["1"]` as `"1"`). | 400 with that parameter's message. |
| Either, given empty (`?date=`) | Treated as not given (an HTML form sends empty values). | none |
| Any other parameter | Ignored, as in F-06. | none |

If both are bad, the `advisorId` message is returned.

A well-formed value that matches nothing is **not** an error: an `advisorId` that is unknown or belongs to a student, a past date, a weekend, or a day with no open slots gives 200 `[]`. The advisor list is already visible to every student (`GET /api/advisors`), so an empty list reveals nothing new.

### 3.2 The Bangkok day of `date`

`date` = `D` selects slots with `D 00:00 (UTC+7) <= startAt < (D + 1 day) 00:00 (UTC+7)`, that is from `D-1 17:00Z` to `D 17:00Z`. A new pure function in `server/src/domain/rules.ts`:

```ts
/** NFR-05: the Bangkok calendar day "2026-11-10" as [start, end) instants, or null if it is not a real date. */
export function bangkokDay(date: string): { start: Date; end: Date } | null;
```

The route uses it for validation (null → 400) and the service uses `start` and `end` in the query. It is unit tested on its own, because every slot starts between 08:00 and 17:30 local (01:00Z to 10:30Z), so an API test cannot tell a Bangkok day from a UTC day.

### 3.3 Failure and boundary cases

| Case | Result | Verified by |
|---|---|---|
| No filter | Exactly the F-06 list | AC-F16-01 |
| `advisorId` = A | Only A's bookable slots, sorted by start | AC-F16-01 |
| `date` = Tue 10 Nov | Only bookable slots starting on Tue 10 Nov (Bangkok), all advisors | AC-F16-02 |
| `advisorId` and `date` | Slots matching both | AC-F16-02 |
| Matching advisor and date, but the slot is booked, past its deadline, deleted or ended | Not listed (F-06 rules still apply) | AC-F16-03 |
| Late slot on the filtered date, now 1 ms before / at its deadline (start - 2 h) | Listed / not listed | AC-F16-03 |
| `bangkokDay("2026-11-10")` | `[2026-11-09T17:00:00.000Z, 2026-11-10T17:00:00.000Z)` | AC-F16-02 (unit) |
| `bangkokDay` of `2026-02-29`, `2026-02-30`, `2026-13-01`, `2026-11-1`, `10/11/2026`, `2026-11-10T00:00` | null (2026 is not a leap year) | AC-F16-04 (unit) |
| `advisorId` = `abc`, `0`, `-1`, `1.5`, `007`, `99999999999`, given twice, or `advisorId[]=1` | 400 `VALIDATION_ERROR`, advisor message | AC-F16-04 |
| `date` = `2026-13-01`, `2026-02-30`, `10/11/2026`, `2026-11-1`, given twice, or `date[a]=2026-11-10` | 400 `VALIDATION_ERROR`, date message | AC-F16-04 |
| `advisorId=&date=` (both empty) | Treated as no filter: the F-06 list | AC-F16-04 |
| `advisorId` unknown (999999) or a student's id; `date` a Saturday or in the past | 200 `[]` | AC-F16-05 |
| Response content, with filters | No `student`, `studentId`, `bookingId` or `status`; no booker's name or email in the body | AC-F16-05 |
| `GET /api/advisors` as a student | Every advisor, `{ id, name }` only, sorted by name; no students; no email | AC-F16-06 |
| Advisor calls either endpoint | 403 `FORBIDDEN_ROLE` | AC-F16-06 |
| No session | 401 `UNAUTHENTICATED` | AC-R01-01 (shared) |

### 3.4 Permissions

| Caller | `GET /api/slots/bookable` (with filters) | `GET /api/advisors` |
|---|---|---|
| Student | Yes, open slots only (as F-06) | Yes, `id` and `name` of every advisor |
| Advisor | No. 403 "Only students can view bookable slots." (F-06) | No. 403 "Only students can list advisors." |
| No valid session | No. 401 | No. 401 |

Matches SDS section 6 ("View bookable slots": student only) and the SDS section 5.1 row for `GET /api/advisors` (Student).

## 4. API contract

### 4.1 Requests

- `GET /api/slots/bookable?advisorId=1&date=2026-11-10`. Both parameters are optional. No body. `sid` cookie required.
- `GET /api/advisors`. No parameters, no body. `sid` cookie required.

### 4.2 Success responses

`GET /api/slots/bookable`: `200 OK`, the F-06 shape (F-06 section 4.2), sorted by `startAt` ascending:

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

`GET /api/advisors`: `200 OK`, sorted by `name`, then `id`:

```json
[
  { "id": 1, "name": "Example Advisor" },
  { "id": 2, "name": "Other Advisor" }
]
```

No email, role or other user field. (Example values are placeholders.)

### 4.3 Error responses

| Status | `code` | `message` | When |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | "The advisor filter must be a positive whole number." | `advisorId` fails section 3.1. |
| 400 | `VALIDATION_ERROR` | "The date filter must be a real date written as YYYY-MM-DD." | `date` fails section 3.1. |
| 401 | `UNAUTHENTICATED` | "You are not logged in." | No valid session. |
| 403 | `FORBIDDEN_ROLE` | "Only students can view bookable slots." | Advisor calls `/api/slots/bookable` (unchanged from F-06). |
| 403 | `FORBIDDEN_ROLE` | "Only students can list advisors." | Advisor calls `/api/advisors`. |
| 500 | `INTERNAL_ERROR` | "Something went wrong." | Unexpected error. |

Format: SDS section 5. No new codes.

## 5. UI behavior

Screen `/slots` (SDS section 4.1, "filters in 3"), role: student.

| Part | Behavior |
|---|---|
| Filter bar | Above the list. Advisor select with "All advisors" first, then the advisors from `GET /api/advisors`. Date input (`type="date"`). A "Clear filters" link, shown only when a filter is set, that goes back to `/slots` (keeping `reschedule` if present). |
| URL | The filters live in the page URL as `advisor` and `date` (`/slots?advisor=1&date=2026-11-10`), so reload, Back and a shared link keep them. The client sends them to the API as `advisorId` and `date`. Empty filters are left out of both URLs. |
| On change | Changing either filter reloads the list at once (no Apply button). While it loads, the old list stays with a small spinner next to the filters. |
| List | As F-06 and F-07: grouped by date, Book (or Move here, F-14) on each row. |
| Empty, no filter | "No bookable slots right now." (F-06) |
| Empty, with a filter | "No bookable slots match these filters." with the Clear filters link. |
| Advisor list fails | The select shows only "All advisors" and the page shows the server's message; the slot list still loads. |
| 400 | A Bootstrap alert with the server's `message` (for example after a hand-typed `?date=2026-02-30`), and no list. The filter bar stays, so the student can fix or clear it. |
| After booking | As F-07: the list reloads with the same filters, so the booked slot disappears. |

The client does not check the rules itself: the server decides what is bookable and which values are valid.

## 6. Data

| Layer | Change |
|---|---|
| Database | No schema change and no migration. Reads `Slot`, `Booking` and `User` as F-06. |
| Query | The filters go into the `prisma.slot.findMany` `where` of `listBookableSlots` (`advisorId`, and `startAt: { gte: start, lt: end }`), before the deadline filter in JavaScript, so a filtered request reads fewer rows. Existing indexes `Slot(advisorId, startAt)` and `Slot(startAt)` cover both cases (NFR-10 is measured on the unfiltered list). |
| Rule function | `bangkokDay(date)` in `server/src/domain/rules.ts` (section 3.2). |
| Routes | The filters on the existing `slotsRouter.get("/bookable")`. A new `advisorsRouter` mounted at `/api/advisors` in `app.ts`. |
| Seed | Unchanged (2 advisors and slots on three weekdays are enough to filter). |

## 7. Acceptance criteria

| AC | Criterion | Expected, observable outcome |
|---|---|---|
| AC-F16-01 | A student filters the bookable list by advisor; with no filter the list is unchanged. | No filter: the same items as F-06. `advisorId` = A: only A's bookable slots, sorted by `startAt`, in the F-06 item shape. |
| AC-F16-02 | A student filters by date (a Bangkok calendar day), alone or with the advisor filter. | `date` = Tue 10 Nov: only slots starting that day, all advisors. Both filters: only slots matching both. `bangkokDay` gives the UTC+7 day bounds. |
| AC-F16-03 | Filters only narrow the list: the F-06 bookable rules (BR-06, BR-16, booked, deleted, ended) still apply. | A booked, deleted, ended or past-deadline slot that matches both filters is not listed. A late slot on the filtered day is listed until its deadline. |
| AC-F16-04 | A bad filter value is rejected with the SDS error format; an empty value means no filter. | Each bad value of section 3.3 gives 400 `VALIDATION_ERROR` with the parameter's message and no slot data. Empty values give the unfiltered list. |
| AC-F16-05 | A valid filter that matches nothing gives an empty list; no booker identity is exposed. | Unknown advisor, a student's id, a Saturday, a past date: 200 `[]`. Filtered items have no `student`, `studentId`, `bookingId` or `status`, and the body has no booker name or email. |
| AC-F16-06 | A student gets the advisor list for the filter; an advisor gets 403 on both endpoints. | Student: every advisor as `{ id, name }` sorted by name, no students, no email. Advisor: 403 `FORBIDDEN_ROLE` with the messages of section 4.3. |

## 8. Software Test Specification (STS)

Test files: `server/tests/slots.bookable.filter.test.ts` and `server/tests/advisors.list.test.ts` (API, Supertest against the `_test` database), the `bangkokDay` cases in `server/tests/domain.rules.test.ts` (unit), and one step in `e2e/tests/journey.spec.ts`. Fake clock as in F-06. Times are Asia/Bangkok. Rows are inserted with Prisma. Now = Mon 9 Nov 2026 10:00 unless stated.

Shared setup for TEST-F16-01 to -05: advisors A and B are `createUsers()`'s "Dr. Advisor One" and "Dr. Advisor Two" (the helper truncates `User` and its dependants first, so no seed data changes the counts). Open slots: A Tue 10 Nov 09:00, A Tue 10 Nov 14:00, A Wed 11 Nov 09:00, B Tue 10 Nov 09:30, B Wed 11 Nov 14:00.

| TEST | AC | Level | Precondition / input | Action | Expected |
|---|---|---|---|---|---|
| TEST-F16-01 | AC-F16-01 | API | Shared setup. Student S1 logged in. | `GET /api/slots/bookable`; then `?advisorId=<A>`; then `?advisorId=<B>`. | No filter: all 5, as F-06. A: Tue 09:00, Tue 14:00, Wed 09:00 in that order, each with `advisor.id` = A and the F-06 fields. B: Tue 09:30, Wed 14:00. |
| TEST-F16-02 | AC-F16-02 | Unit + API | Shared setup. | Unit: `bangkokDay("2026-11-10")`, `bangkokDay("2026-12-31")`. API: `?date=2026-11-10`; `?date=2026-11-11`; `?advisorId=<A>&date=2026-11-10`. | Unit: `[2026-11-09T17:00Z, 2026-11-10T17:00Z)` and `[2026-12-30T17:00Z, 2026-12-31T17:00Z)`. API: Tue → A 09:00, B 09:30, A 14:00. Wed → A 09:00, B 14:00. A + Tue → A 09:00, A 14:00. |
| TEST-F16-03 | AC-F16-03 | API | Shared setup, plus on A and Tue 10 Nov: 10:00 with an ACTIVE booking by S2, 10:30 soft-deleted, 11:00 Open. Plus A Fri 6 Nov 10:00 (ended). Plus a late slot A Wed 11 Nov 10:00 created Tue 10 Nov 19:00 (`isLate` true). | `?advisorId=<A>&date=2026-11-10` at now; `?advisorId=<A>&date=2026-11-06`; `?advisorId=<A>&date=2026-11-11` at Wed 07:59:59.999 and at Wed 08:00:00. | Tue: 09:00, 11:00, 14:00 (not 10:00 booked, not 10:30 deleted). Fri 6: `[]`. Wed at 07:59:59.999: only the late 10:00 (the normal Wed 09:00 closed at Tue 18:00, BR-06). Wed at 08:00:00 (10:00 - 2 h, BR-16): `[]`. |
| TEST-F16-04 | AC-F16-04 | Unit + API | Shared setup. S1 logged in. | Unit: `bangkokDay` of `2026-02-29`, `2026-02-30`, `2026-13-01`, `2026-11-1`, `10/11/2026`, `2026-11-10T00:00`. API: `advisorId` = `abc`, `0`, `-1`, `1.5`, `007`, `99999999999`, `?advisorId=1&advisorId=2` and `?advisorId[]=<A>`; `date` = `2026-13-01`, `2026-02-30`, `10/11/2026`, `2026-11-1`, `?date=2026-11-10&date=2026-11-11` and `?date[a]=2026-11-10`; `?advisorId=abc&date=bad`; `?advisorId=&date=`. | Unit: all null. API: 400 `VALIDATION_ERROR` with the advisor message for each `advisorId` case and for `abc` + `bad`; with the date message for each `date` case; the body has only `error`. Empty values: 200 with all 5 slots. |
| TEST-F16-05 | AC-F16-05 | API | Shared setup, plus A Tue 10 Nov 15:00 booked by S2 (named "Booker Two", email `booker2@example.test`). | `?advisorId=999999`; `?advisorId=<S1's id>`; `?date=2026-11-14` (Saturday); `?date=2026-11-06` (past); `?advisorId=<A>&date=2026-11-10`. | 200 `[]` four times. The last: 2 items (09:00, 14:00), no item has `student`, `studentId`, `bookingId` or `status`, and the raw body does not contain "Booker Two" or `booker2@example.test`. |
| TEST-F16-06 | AC-F16-06 | API | `createUsers()` (Student One, "Dr. Advisor One", "Dr. Advisor Two"), plus advisors "Zed Advisor" and "Amy Advisor" and a second student created by the test. | S1: `GET /api/advisors`. Advisor A: `GET /api/advisors` and `GET /api/slots/bookable?advisorId=<A>`. | S1: 200, exactly 4 items in this order: Amy Advisor, Dr. Advisor One, Dr. Advisor Two, Zed Advisor, each item exactly `{ id, name }`, no student. Advisor: 403 `FORBIDDEN_ROLE` with "Only students can list advisors." and "Only students can view bookable slots.". |

R-01: `server/tests/r01.auth.test.ts` adds `GET /api/advisors` to `PROTECTED` (the route inventory test then covers it). `GET /api/slots/bookable` is already listed.

UI/E2E (`e2e/tests/journey.spec.ts`, real clock, seed data): student1 opens `/slots`, picks "Advisor Two" in the Advisor select, and at least one row is listed and every listed row shows Advisor Two; picks the date of the first listed row, and at least one row is listed and every row is on that date; Clear filters brings back rows of both advisors. (The seed gives Advisor Two 10:00 and 13:30 on each of three weekdays, two or more days ahead, minus Student Three's booking, so the lists are never empty.) Then it opens `/slots?date=2026-02-30` and sees "The date filter must be a real date written as YYYY-MM-DD." (NFR-07, Sprint 3 check). The step uses only seeded open slots on the next weekdays, so it does not depend on the time of day.

### 8.1 TDD plan

1. Red: TEST-F16-01 to -06, the R-01 row, and a `bangkokDay` stub that returns null. The filter tests fail on assertions (the filters are ignored, so too many items come back, and bad values give 200 instead of 400); `/api/advisors` fails on the 404 of a missing route. No compile or type error.
2. Green: `bangkokDay`, the filters in the route and `listBookableSlots`, `advisorsRouter`.
3. UI and the E2E step.

## 9. Known limitations

- One advisor and one day at a time: no date range, no several advisors, no time-of-day or text search.
- No paging (as F-06). NFR-10 is measured on the unfiltered list.
- The advisor list shows every advisor, also one with no open slots; picking that advisor gives the empty-state message.

## 10. Completion evidence

Failing-then-passing runs saved as `evidence/f16-red.txt` and `evidence/f16-green.txt`, `npm test` counts, the E2E run, PR link and reviewer, Issue #75.
