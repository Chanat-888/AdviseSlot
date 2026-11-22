# Project decision log

Theme 1: Appointment and Scheduling System. Team ID digits 1 and 9.

| ID | Decision |
|---|---|
| D-01 | Context: students book office-hour advising appointments with advisors (Advisor = Staff role, Student = Customer role). |
| D-02 | Every slot has a fixed length of 30 minutes. |
| D-03 | A student may book any advisor (no advisor-student assignment). |
| D-04 | One slot holds at most one active booking. Concurrent attempts must not create two bookings (enforced in the DB). |
| D-05 | An advisor cannot create a slot that overlaps another of their own slots. |
| D-06 | Slots must lie within 08:00-18:00 and must not start in the past. |
| D-07 | Booking cutoff: morning slots (start before 12:00) must be booked by 18:00 of the previous day; afternoon slots (start 12:00 or later) must be booked at least 2 hours before start. |
| D-08 | (Sprint 2) A student can cancel at least 12 hours before start. An advisor can cancel with a required reason (until the slot starts, see D-18). A cancelled booking frees the slot. |
| D-09 | An advisor cannot delete a slot that has an active booking; the booking must be cancelled first. |
| D-10 | (Replaced by D-31.) A student may hold at most 1 active booking in total, across all advisors. |
| D-11 | Students see free slots of all advisors and only their own bookings. Advisors see bookings only on their own slots. Nobody sees who booked another advisor's slot. |
| D-12 | No Admin role. Accounts are seeded. |
| D-13 | Stack: same as Labs 1-4 (TokTickIT): React + TypeScript + Vite + Bootstrap, Node.js + Express + TypeScript + Prisma, PostgreSQL. Tests: Vitest + Supertest (server), Vitest + Testing Library (client), Playwright (E2E). Auth: bcrypt password hashes, server-side Session table, httpOnly cookie. |
| D-14 | Slots only on weekdays (Monday to Friday). Weekend slots are rejected. |
| D-15 | A slot start time must be on :00 or :30. |
| D-16 | An advisor may create a slot after its normal booking deadline (late slot). A late slot stays bookable until 2 hours before start, and students get an in-app notification about it (Sprint 3). No email, LINE or SMS. |
| D-17 | A booking whose slot has ended no longer counts toward the 1-active-booking limit and is shown as "Passed". |
| D-18 | An advisor can cancel a booking until the slot starts. The student sees the advisor's reason. |
| D-19 | Reschedule (FR-14) and batch slot creation (FR-15) stay in scope. |
| D-20 | The advisor summary shows counts (slots, booked, cancelled, open) plus a list of upcoming appointments. |
| D-21 | A login session lasts 2 hours (absolute, no renewal). |
| D-22 | The 12-hour student cancellation limit plus the booking deadline rule are the team's answer to the brief's "cancellation limits". No TA question needed. |
| D-23 | An advisor cannot create a late slot that starts 2 hours or less from now (at or after its BR-16 cutoff), because it could never be booked. The request is rejected with 422 `SLOT_UNBOOKABLE`. So every late slot that is created is bookable at creation, and the late-slot notification is never sent for an unbookable slot. |
| D-24 | One status vocabulary everywhere. Slot statuses: Open (future, unbooked, before its booking deadline), Booked (has an active booking), Closed (future, unbooked, booking deadline passed), Passed (slot has ended). Booking statuses shown to users: Upcoming (active, slot not ended), Passed (active, slot ended), Cancelled. |
| D-25 | Local development runs PostgreSQL 17 in Docker via `docker compose` (`docker-compose.yml` at the repo root, host port 5433 to avoid clashing with a local PostgreSQL on 5432, named volume for data). The server and client run on the host with `npm run dev`. The full application Dockerfile is built in Lab 5. |
| D-26 | The login email is trimmed and lowercased before the lookup (F-01). Seed emails are stored in lowercase, and this is enforced by a CHECK constraint on `User.email` (`"email" = lower("email")`, raw SQL in the F-01 migration). No requirement text changes. |
| D-27 | Sprint 1 cut line: if the Sprint 1 release is at risk, the UI screens of F-08 and F-09 are cut before the API, rules or tests. The cut is disclosed in the release notes and in Part F. |
| D-28 | Editing a slot's start time (F-12) applies the creation rules to the new start as if the slot were created now: BR-02, BR-03, BR-04 (the slot itself excluded), and `isLate` is recomputed with `isLateSlot(newStart, now)`. A new start that is late and 2 hours or less from now is rejected with 422 `SLOT_UNBOOKABLE` (D-23). `createdAt` does not change. Editing sends no late-slot notification (FR-19 covers created slots only). Reason: the booking deadline must follow the slot's new time; keeping the old flag could give a moved slot a deadline that BR-06 would not allow. Closes SDS O-03. |
| D-29 | An advisor can edit (F-12) or delete (F-13) a slot only before it starts (`now < startAt`), otherwise 422 `SLOT_ALREADY_STARTED`. Delete is a soft delete (`deletedAt` = now), so cancelled bookings and later history (F-17, F-18) keep their slot. A deleted slot is treated as not found (404) by every endpoint that addresses a slot by id, and it does not block a new slot at the same time. |
| D-30 | Batch create (F-15) is all-or-nothing. The advisor sends the first start and the end of a range on one local date. Every 30-minute slot in the range is checked with the F-04 rules; if any slot fails, no slot is created and the error message names the first failing slot's time. Reason: no partial schedule to clean up, and the advisor fixes the range and retries (same atomic idea as BR-15). |
| D-31 | BR-07 changes (replaces D-10): a student holds at most two active bookings in total, and at most one active booking with the same advisor. Active keeps its meaning (ACTIVE and slot end in the future); ended and cancelled bookings still do not count (D-17). The same-advisor check runs first (409 `SAME_ADVISOR_BOOKING`), then the limit of two (409 `ACTIVE_BOOKING_LIMIT`), both after the student row lock. Reason: students often need two different advisors in the same period (for example academic and project advisor), while one student still cannot hold several slots of one advisor. Lab 7 change request #67, approved by TA Supachok Deetaweesukh on 2026-11-22. No data migration: existing data holds at most one active booking per student, which is valid under the new rule. |

Team:
- Chanat Dachkhumhang (Pan), 67070503409, GitHub @Chanat-888
- Jeerasak Phisawong (Snooker), 67070503461, GitHub @ShitheadQuin

Repository: https://github.com/Chanat-888/AdviseSlot
