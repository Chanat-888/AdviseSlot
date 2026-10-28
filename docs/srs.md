# AdviseSlot: Software Requirements Specification (SRS)

| Item | Value |
|---|---|
| Course | CPE 334, Semester 1/2026, Group Project |
| Theme | 1. Appointment and Scheduling System |
| Context | Office-hour advising appointments between students and advisors |
| Team | Chanat Dachkhumhang (67070503409), Jeerasak Phisawong (67070503461) |
| Owner of this document | Chanat Dachkhumhang (reviewer: Jeerasak Phisawong) |
| Related documents | `docs/decisions.md`, `docs/system-sds.md` |

## Version history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-10-28 | Chanat (drafted with an AI agent) | First draft from team decisions D-01 to D-13. Awaiting team review. |
| 0.2 | 2026-10-28 | Chanat (drafted with an AI agent) | Applied decisions D-14 to D-22: weekdays only, :00/:30 starts, late-slot exception and in-app notification (FR-19), "Passed" status, advisor cancels until start, 2-hour session. Closed Q-01 to Q-03. |

## 1. Stakeholder problem and context

Students need to meet their advisors during office hours, but they arrange meetings
through chat messages and email. Two students often ask for the same time, advisors
lose track of who is coming, and students show up at times that were never offered.

AdviseSlot lets each advisor publish fixed 30-minute office-hour slots. Students see
the free slots of all advisors and book one. The system prevents double booking,
enforces booking deadlines, and keeps each student's bookings private.

## 2. Actors and responsibilities

| Actor | System role | Responsibilities |
|---|---|---|
| Student | `STUDENT` (Customer role in the theme brief) | Browse free slots of any advisor, book a slot, view and (Sprint 2) cancel or reschedule their own booking. |
| Advisor | `ADVISOR` (Staff role in the theme brief) | Publish and maintain their own office-hour slots, view bookings on their own slots, (Sprint 2) cancel a booking with a reason. |
| System | n/a | Authenticates users, enforces business rules and access rules on the server, stores data in PostgreSQL. |

There is no administrator role. User accounts are created by the seed script (D-12).

## 3. Scope

### 3.1 In scope (whole product, Sprints 1 to 3)

- Login, logout and current-user identity with server-side sessions.
- Advisor slot publishing and maintenance (create, edit, delete) within the rules.
- Student browsing of free slots across all advisors, with filtering.
- Booking with conflict prevention, deadline rules and a per-student limit.
- Cancellation and rescheduling.
- Booking views for students and advisors, and an advisor appointment summary.
- In-app notifications to students about late slots (no external messaging).

### 3.2 Exclusions

- Self-registration, password recovery, email verification and account administration.
- Email, SMS, LINE or calendar notifications, and any external API.
- Recurring slot templates, variable slot lengths and group (multi-student) appointments.
- Video-call links, meeting notes and attendance or no-show tracking.
- Public holidays and advisor leave calendars.

## 4. Functional requirements (FR)

| ID | Requirement | Sprint |
|---|---|---|
| FR-01 | A user logs in with email and password. On success the system creates a session and returns the user's name and role. | 1 |
| FR-02 | A logged-in user logs out. The system ends the session so later requests with it are rejected. | 1 |
| FR-03 | A logged-in user retrieves their own identity (id, name, email, role). | 1 |
| FR-04 | An advisor creates a slot by choosing a date and a start time. The system sets the end time to start + 30 minutes. | 1 |
| FR-05 | An advisor lists their own slots, each with its status (open, booked, past) and, when booked, the booking student's name. | 1 |
| FR-06 | A student lists all currently bookable slots of all advisors, showing advisor name, start, end and booking deadline. | 1 |
| FR-07 | A student books a bookable slot. | 1 |
| FR-08 | A student lists their own bookings (upcoming and past) and opens one booking's detail. | 1 |
| FR-09 | An advisor opens the detail of a booking on one of their own slots. | 1 |
| FR-10 | A student cancels their own active booking. | 2 |
| FR-11 | An advisor cancels an active booking on their own slot and must enter a reason. The student sees the reason. | 2 |
| FR-12 | An advisor changes the start time of their own unbooked future slot. | 2 |
| FR-13 | An advisor deletes their own unbooked slot. | 2 |
| FR-14 | A student reschedules their active booking to another bookable slot in one action. | 2 |
| FR-15 | An advisor creates several consecutive 30-minute slots for one date and time range in one action. | 2 |
| FR-16 | A student filters bookable slots by advisor and by date. | 3 |
| FR-17 | An advisor views an appointment summary for a chosen date range: number of slots, booked, cancelled, and upcoming appointments. | 3 |
| FR-18 | A student and an advisor see cancelled bookings in their history with who cancelled and the reason. | 3 |
| FR-19 | When an advisor creates a late slot (BR-16), every student gets an in-app notification with the advisor, date and time. A student lists their notifications and marks them as read. | 3 |

## 5. Business rules (BR)

All times are evaluated in the Asia/Bangkok time zone (UTC+7) and stored in UTC.
"Now" means the server clock, never a time sent by the client.

| ID | Rule | Source | Sprint |
|---|---|---|---|
| BR-01 | Every slot is exactly 30 minutes long. The client sends only the start time. | D-02 | 1 |
| BR-02 | A slot is on a weekday (Monday to Friday), starts on the hour or half hour, starts at or after 08:00, and ends at or before 18:00. | D-06, D-14, D-15 | 1 |
| BR-03 | A slot cannot be created (or moved) to a start time in the past. | D-06 | 1 |
| BR-04 | An advisor's slots cannot overlap each other. | D-05 | 1 |
| BR-05 | A slot holds at most one active booking. When two students book the same slot at the same time, exactly one succeeds. | D-04 | 1 |
| BR-06 | Booking deadline: for a slot starting before 12:00, booking closes at 18:00 on the previous day. For a slot starting at 12:00 or later, booking closes 2 hours before the start. A booking at or after the deadline is rejected. Exception: BR-16. | D-07 | 1 |
| BR-07 | A student holds at most one active booking in total, across all advisors. An active booking has status ACTIVE and a slot end time in the future. A booking whose slot has ended no longer counts and is shown as "Passed". | D-10, D-17 | 1 |
| BR-08 | Only advisors create and maintain slots, and only their own. | D-09, D-11 | 1 |
| BR-09 | A student sees only their own bookings. An advisor sees only bookings on their own slots. The bookable-slot list never reveals who booked a slot. | D-11 | 1 |
| BR-10 | A session expires 2 hours after login, with no renewal. Logout ends it immediately. | D-21 | 1 |
| BR-11 | A student can cancel their booking only if the slot starts at least 12 hours from now. | D-08 | 2 |
| BR-12 | An advisor can cancel a booking on their own slot until the slot starts, with a non-empty reason (1 to 500 characters). The student sees the reason. | D-08, D-18 | 2 |
| BR-13 | A cancelled booking frees its slot, so the slot becomes bookable again if its deadline has not passed. | D-08 | 2 |
| BR-14 | A slot with an active booking cannot be edited or deleted. The booking must be cancelled first. | D-09 | 2 |
| BR-15 | A reschedule succeeds only if cancelling the old booking satisfies BR-11 and booking the new slot satisfies BR-05 and BR-06. It is all-or-nothing: on failure, the original booking stays unchanged. | D-08 | 2 |
| BR-16 | Late slot: a slot created at or after its normal BR-06 deadline is still allowed. It stays bookable until 2 hours before its start. Its creation triggers the FR-19 notification. | D-16 | 1 (rule), 3 (notification) |

## 6. Non-functional requirements (NFR)

| ID | Category | Requirement and measurable target | Verification method | Sprint |
|---|---|---|---|---|
| NFR-01 | Security | Passwords are stored only as bcrypt hashes (cost 12). No plaintext password appears in the database or logs. | Integration test reads the seeded user row and asserts the stored value is a bcrypt hash, not the password. | 1 |
| NFR-02 | Security | Every protected endpoint returns 401 to an unauthenticated request, with no private data in the body. | API test per protected endpoint. | 1 |
| NFR-03 | Security | A user requesting another user's booking gets 404 with no booking data. A user calling an operation for another role gets 403. | API tests for cross-student, cross-advisor and wrong-role cases. | 1 |
| NFR-04 | Data integrity | 10 concurrent booking requests for the same open slot create exactly 1 active booking. | Integration test with parallel requests against the real database. | 1 |
| NFR-05 | Correctness | Rule time calculations use Asia/Bangkok local time, including the 18:00 previous-day boundary. | Unit tests at the boundaries (17:59 accepted, 18:00 rejected; 2 h 01 min accepted, exactly 2 h rejected; a late slot follows the 2-hour rule; Saturday rejected). | 1 |
| NFR-06 | Persistence | Data survives an application restart and a redeployment. | Sprint 1: manual restart check of the local server. Sprint 2: post-deployment check on GCP (Lab 5). | 1, 2 |
| NFR-07 | Error handling | Every rejected request returns a 4xx status with a machine-readable code and a readable message. No stack trace or SQL error reaches the client. The UI shows the message. | API tests assert the error shape. E2E test shows the message in the UI. | 1, 3 |
| NFR-08 | Configuration | No secret is committed to Git or shipped in client code. All configuration comes from environment variables. | Review checklist on each PR; secret scan of the repo before each release. | 1 |
| NFR-09 | Deployability | The application runs from a Docker image with configuration supplied by environment variables. | Fresh Docker build and run in Lab 5. | 2 |
| NFR-10 | Performance | The bookable-slot list returns in under 500 ms (p95 of 50 requests) with 1,000 seeded slots, on the deployed GCP service. | Scripted measurement in Sprint 3. | 3 |

## 7. Assumptions

| ID | Assumption |
|---|---|
| A-01 | All users are in the Asia/Bangkok time zone. The UI displays local time. |
| A-02 | Replaced in v0.2 by BR-02 (weekdays only). |
| A-03 | Replaced in v0.2 by BR-16 (late slots). |
| A-04 | A past booking with status ACTIVE is shown as "Passed". The system does not record attendance. |
| A-06 | Public holidays are not blocked. Advisors simply do not create slots on those days. |
| A-05 | Seeded demo data is synthetic. No real student or advisor data is used. |

## 8. Decisions

Decisions D-01 to D-22 are recorded in `docs/decisions.md`. Summary:

| ID | Decision |
|---|---|
| D-01 | Context is student office-hour advising. Advisor = Staff role, Student = Customer role. |
| D-02 | Fixed 30-minute slots. |
| D-03 | A student may book any advisor. |
| D-04 | One active booking per slot, enforced in the database. |
| D-05 | No overlapping slots for one advisor. |
| D-06 | Slots between 08:00 and 18:00, not in the past. |
| D-07 | Morning slots close at 18:00 the previous day. Afternoon slots close 2 hours before start. |
| D-08 | Student cancels at least 12 h before. Advisor cancels with a reason. Cancel frees the slot. |
| D-09 | A booked slot cannot be deleted. |
| D-10 | One active booking per student in total. |
| D-11 | Visibility rules as in BR-09. |
| D-12 | No admin role. Seeded accounts. |
| D-13 | Stack reused from Labs 1-4 (see SDS). |
| D-14 | Weekdays only. |
| D-15 | Start times on :00 or :30. |
| D-16 | Late slots allowed, bookable until 2 h before start, with in-app notification. |
| D-17 | Ended bookings shown as "Passed" and do not count toward the limit. |
| D-18 | Advisor cancels until the slot starts. Student sees the reason. |
| D-19 | Reschedule and batch slot creation stay in scope. |
| D-20 | Summary: counts plus upcoming appointments. |
| D-21 | 2-hour session. |
| D-22 | Cancellation limits resolved by the team (no TA question). |

## 9. Questions and resolution

| ID | Question | Resolution |
|---|---|---|
| Q-01 | Should weekend slots be blocked? | Resolved 2026-10-28: yes, weekdays only (D-14, BR-02). |
| Q-02 | What happens when an advisor creates a slot after its booking deadline? | Resolved 2026-10-28: allowed as a late slot, bookable until 2 h before start, students notified in-app (D-16, BR-16, FR-19). |
| Q-03 | Do the deadline rule and the 12-hour cancellation limit answer the brief's "cancellation limits"? | Resolved 2026-10-28 by the team: yes (D-22). No TA consultation needed. |
