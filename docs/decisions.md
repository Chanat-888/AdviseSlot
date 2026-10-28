# Project decisions (draft, before SRS)

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
| D-08 | (Sprint 2) A student can cancel at least 12 hours before start. An advisor can cancel at any time with a required reason. A cancelled booking frees the slot. |
| D-09 | An advisor cannot delete a slot that has an active booking; the booking must be cancelled first. |
| D-10 | A student may hold at most 1 active booking in total, across all advisors. |
| D-11 | Students see free slots of all advisors and only their own bookings. Advisors see bookings only on their own slots. Nobody sees who booked another advisor's slot. |
| D-12 | No Admin role. Accounts are seeded. |
| D-13 | Stack: same as Labs 1-4 (TokTickIT): React + TypeScript + Vite + Bootstrap, Node.js + Express + TypeScript + Prisma, PostgreSQL. Tests: Vitest + Supertest (server), Vitest + Testing Library (client), Playwright (E2E). Auth: bcrypt password hashes, server-side Session table, httpOnly cookie. |

Team:
- Chanat Dachkhumhang (Pan), 67070503409, GitHub @Chanat-888
- Jeerasak Phisawong (Snooker), 67070503461, GitHub @ShitheadQuin

Still needed: GitHub repo URL.
