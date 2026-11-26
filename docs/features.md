# AdviseSlot: Feature Inventory

| Item | Value |
|---|---|
| Course | CPE 334, Semester 1/2026, Group Project |
| Owner of this document | Chanat Dachkhumhang (reviewer: Jeerasak Phisawong) |
| Related documents | `docs/srs.md` (v1.0), `docs/system-sds.md`, `docs/traceability.md`, `docs/decisions.md` |

## Version history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-10-28 | Chanat (drafted with an AI agent) | First feature inventory from SRS v0.2. Awaiting team review. |
| 0.2 | 2026-10-28 | Chanat (drafted with an AI agent) | Aligned with SRS v0.3: F-04 rejects a late slot starting 2 h or less from now (D-23), F-05 uses D-24 statuses, F-17 includes the open count. |
| 0.3 | 2026-11-04 | Chanat (drafted with an AI agent) | Related documents point to SRS v0.4 (decision list D-01 to D-27). No feature changes. |
| 0.4 | 2026-11-23 | Chanat (drafted with an AI agent) | Aligned with SRS v0.5: F-07 uses the new BR-07 of Lab 7 change request #67 (D-31), at most two active bookings and at most one with the same advisor. Sprint 2 (F-10 to F-15) marked done, released as `v0.2.0-sprint-2`. |
| 1.0 | 2026-11-26 | Chanat (drafted with an AI agent) | Final version for the `v1.0.0` release, checked against the code on `sprint-3` `d12ecfd`. Section 4: Sprint 3 status (F-16 to F-19 merged), and the F-16 to F-19 rows match their final contracts (linked requirements, dependencies, what each screen shows). Related documents point to SRS v1.0. |

## 1. Conventions

- Feature IDs `F-01`, `F-02`, ... and responsibility IDs `R-01`, `R-02`, ... are stable.
  They are never renumbered or reused. A dropped feature keeps its ID and is marked "Removed".
- Sprint 1 acceptance criteria are named `AC-Fxx-nn` and their tests `TEST-Fxx-nn`
  (responsibilities: `AC-Rxx-nn`, `TEST-Rxx-nn`). `TEST-Fxx-nn` verifies `AC-Fxx-nn`.
  The planned IDs are listed in `docs/traceability.md`. Sprint 2 and 3 features get their
  AC and tests in that sprint's contract.
- Every feature depends on the cross-cutting responsibilities R-01 to R-04 (section 5).
  The Dependencies column lists only feature-to-feature dependencies.
- Roles: `STUDENT` and `ADVISOR` (SRS section 2). "Any" means any logged-in user.

## 2. Sprint 1: authenticated booking slice

Goal: a student and an advisor can log in, the advisor publishes a slot, the student books it,
and both see the saved booking, with every rule and ownership check enforced on the server.

| ID | Feature | Description | Related requirements | Depends on | Primary role |
|---|---|---|---|---|---|
| F-01 | Log in | Log in with email and password. Creates a server-side session (httpOnly cookie) that expires 2 hours after login. Returns name and role. | FR-01, BR-10, NFR-01, NFR-02 | none | Anyone |
| F-02 | Log out | End the current session immediately. Later requests with it get 401. | FR-02, BR-10 | F-01 | Any |
| F-03 | Current user | Return the logged-in user's id, name, email and role. The client uses it for routing. | FR-03, NFR-02 | F-01 | Any |
| F-04 | Create slot | Advisor picks a date and start time. Server sets end = start + 30 min and checks weekday, :00/:30, 08:00-18:00, not past, no overlap. A slot created after its normal deadline is accepted as a late slot if it starts more than 2 hours from now; otherwise it is rejected (`SLOT_UNBOOKABLE`). | FR-04, BR-01, BR-02, BR-03, BR-04, BR-08, BR-16 (rule), NFR-03, NFR-05 | F-01 | Advisor |
| F-05 | View own slots | Advisor lists their own slots with status (Open, Booked, Closed, Passed, per D-24) and the booking student's name when booked. | FR-05, BR-08, BR-09, NFR-03 | F-04 | Advisor |
| F-06 | View bookable slots | Student lists every currently bookable slot of all advisors: advisor name, start, end, booking deadline. No booker identity is exposed. | FR-06, BR-06, BR-09, BR-16 (rule), NFR-03, NFR-05, NFR-10 (Sprint 3) | F-04 | Student |
| F-07 | Book slot | Student books a bookable slot. Enforces one active booking per slot (also under concurrency), the booking deadline (including late slots) and BR-07: at most two active bookings per student, at most one with the same advisor (D-31). | FR-07, BR-05, BR-06, BR-07, BR-09, BR-16 (rule), NFR-03, NFR-04, NFR-05 | F-06 | Student |
| F-08 | View own bookings | Student lists their own bookings, upcoming and past. An ended ACTIVE booking is shown as "Passed". | FR-08, BR-07, BR-09 | F-07 | Student |
| F-09 | Booking detail | The booking's student or the slot's advisor opens one booking's detail. Anyone else gets 404 with no booking data. | FR-08, FR-09, BR-09, NFR-03 | F-07 | Student, Advisor |

## 3. Sprint 2: change and cancel

Status: done. F-10 to F-15 were released on 2026-11-23 as `v0.2.0-sprint-2`.

| ID | Feature | Description | Related requirements | Depends on | Primary role |
|---|---|---|---|---|---|
| F-10 | Student cancels booking | Student cancels their own active booking if the slot starts at least 12 hours from now. The slot becomes bookable again if its deadline has not passed. | FR-10, BR-11, BR-13 | F-07, F-09 | Student |
| F-11 | Advisor cancels booking | Advisor cancels an active booking on their own slot until the slot starts, with a reason of 1 to 500 characters. The student sees the reason. The slot is freed. | FR-11, BR-12, BR-13 | F-07, F-09 | Advisor |
| F-12 | Edit slot | Advisor changes the start time of their own unbooked future slot. The slot rules of F-04 apply to the new time. | FR-12, BR-01, BR-02, BR-03, BR-04, BR-08, BR-14 | F-04 | Advisor |
| F-13 | Delete slot | Advisor deletes their own unbooked slot (soft delete). | FR-13, BR-08, BR-14 | F-04 | Advisor |
| F-14 | Reschedule booking | Student moves their active booking to another bookable slot in one all-or-nothing action. | FR-14, BR-05, BR-06, BR-07, BR-11, BR-15 | F-07, F-10 | Student |
| F-15 | Batch create slots | Advisor creates consecutive 30-minute slots for one date and time range in one action. Each slot follows the F-04 rules. | FR-15, BR-01, BR-02, BR-03, BR-04, BR-08, BR-16 (rule) | F-04 | Advisor |

## 4. Sprint 3: views, history and notification

Status: done. F-16 was released in `v0.3.0-rc` (Issue #75, PR #98). F-17 (Issue #114, PR #115),
F-18 (Issue #112, PR #113) and F-19 (Issue #116, PR #117) were merged into `sprint-3` on
2026-11-26 and ship in `v1.0.0`.

| ID | Feature | Description | Related requirements | Depends on | Primary role |
|---|---|---|---|---|---|
| F-16 | Filter bookable slots | Student filters the bookable-slot list by advisor and by one Bangkok calendar day. Filters only narrow the F-06 list; a bad value gives 400. The advisor select comes from `GET /api/advisors` (`id` and `name` only). | FR-16, FR-06, BR-06, BR-09, BR-16 (rule), NFR-03, NFR-05, NFR-07 | F-06 | Student |
| F-17 | Appointment summary | Advisor views, for a chosen range of Bangkok days (at most 90) on their own slots, the number of slots, booked, cancelled and open (counted as in D-33), and the list of upcoming appointments. | FR-17, BR-08, BR-09, NFR-03, NFR-05, NFR-07 | F-05, F-10, F-11, F-13, F-16 | Advisor |
| F-18 | Cancellation history | Student: Cancelled bookings on `/bookings` (from `GET /api/bookings/mine`) show "Cancelled by you" or the advisor's name and reason. Advisor: `/history` lists cancelled and passed bookings on own slots, deleted slots included, with the student, who cancelled and the reason. | FR-18, BR-09, NFR-03 | F-08, F-10, F-11, F-13, F-14 | Student, Advisor |
| F-19 | Late-slot notification | Creating a late slot (F-04, or each late slot of an F-15 batch) writes one in-app notification per student in the same transaction. A student sees an unread badge, lists notifications newest first with the slot's current advisor, date and time and whether it can still be booked (D-32), and marks one as read. No external messaging. | FR-19, BR-16 (notification), BR-09, NFR-03 | F-04, F-15 | Student |

## 5. Cross-cutting responsibilities

These are system responsibilities, not user features. Each one is established in one sprint
and then re-verified whenever a sprint adds endpoints or changes delivery.

| ID | Responsibility | Description | Related requirements | Established | Verified |
|---|---|---|---|---|---|
| R-01 | Authentication and authorization | Session lookup middleware, role checks (403) and ownership checks (404) on every protected endpoint, using the role matrix in SDS section 6. Hidden UI controls are not authorization. | NFR-01, NFR-02, NFR-03, BR-08, BR-09, BR-10 | Sprint 1 | Sprint 1 API tests for all Sprint 1 endpoints; extended to each new endpoint in Sprints 2 and 3. |
| R-02 | Error handling | One error format (4xx, machine-readable `code`, readable `message`) from a central handler. No stack trace or SQL error reaches the client. The UI shows the message. | NFR-07 | Sprint 1 | Sprint 1 API tests and E2E check; re-verified in Sprint 3 (NFR-07). |
| R-03 | Configuration and secrets | All configuration from environment variables, `.env.example` without real values, no secret in Git or client code. | NFR-08 | Sprint 1 | Sprint 1 PR checklist and secret scan; repeated before each release. |
| R-04 | Persistence and deployment | PostgreSQL with Prisma migrations and idempotent seed; Docker image; GCP deployment with durable storage. Hosts the NFR-10 measurement. | NFR-06, NFR-09, NFR-10 | Sprint 1 (local persistence), Sprint 2 (Docker, GCP) | Sprint 1 manual restart check; Sprint 2 Docker build and post-deployment check (Lab 5); Sprint 3 performance measurement. |
