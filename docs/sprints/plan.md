# AdviseSlot: Three-Sprint Plan (Part D)

| Item | Value |
|---|---|
| Course | CPE 334, Semester 1/2026, Group Project |
| Owner of this document | Chanat Dachkhumhang (reviewer: Jeerasak Phisawong) |
| Related documents | `docs/features.md`, `docs/srs.md` (v0.4), `docs/traceability.md`, `docs/system-sds.md`, `docs/decisions.md` |

## Version history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-04 | Chanat (drafted with an AI agent) | First three-sprint plan from `docs/features.md` v0.2. Awaiting team review. |
| 0.2 | 2026-11-04 | Chanat (drafted with an AI agent) | Team answers applied: the cut line is decision D-27; Sprint 1 test files follow the `server/tests/<area>.<action>.test.ts` layout; Lab 5 has no date in the plan. |

## 1. Overview

| Sprint | Goal | Features | Checkpoint |
|---|---|---|---|
| 1 | Authenticated booking slice | F-01 to F-09 | Deliverable 1, 8 Nov 2026 |
| 2 | Change and cancel | F-10 to F-15 | Deliverable 2, 29 Nov 2026 |
| 3 | Views, history and notification | F-16 to F-19 | Progress at 29 Nov 2026, complete by 13 Dec 2026 |

Scope and IDs come from `docs/features.md`. The three sprints together cover all 19
features (F-01 to F-19), so they cover every FR (FR-01 to FR-19), BR (BR-01 to BR-16)
and NFR (NFR-01 to NFR-10) in `docs/traceability.md`. The cross-cutting responsibilities
R-01 to R-04 are established and verified across the sprints as shown in section 5.

Team: Pan (@Chanat-888) and Snooker (@ShitheadQuin). Both take part in every sprint.
The branch and review workflow is in `docs/workflow.md`: work branches go into
`sprint-N` through a PR reviewed by the teammate, and one release PR takes `sprint-N`
into `main`.

## 2. Sprint 1: authenticated booking slice

**Goal.** A student and an advisor can log in, the advisor publishes a slot, the student
books it, and both see the saved booking, with every rule and ownership check enforced
on the server (`docs/features.md` section 2).

**Features.**

| Group | Features |
|---|---|
| Identity | F-01 Log in, F-02 Log out, F-03 Current user |
| Advisor side | F-04 Create slot, F-05 View own slots |
| Student side | F-06 View bookable slots, F-07 Book slot, F-08 View own bookings |
| Shared | F-09 Booking detail (the booking's student or the slot's advisor) |
| Responsibilities | R-01, R-02, R-03 established; R-04 local persistence only |

**Dependencies.**

- F-02 and F-03 depend on F-01. F-04 depends on F-01.
- F-05 depends on F-04. F-06 depends on F-04. F-07 depends on F-06.
- F-08 and F-09 depend on F-07.
- Every feature uses R-01 to R-04 (`docs/features.md` section 1).
- The seed accounts (2 advisors, 3 students, SDS section 3.3) are needed by all
  tests and by the E2E journey.
- Contracts F-01 to F-09 are written and reviewed before the code for each feature
  (spec before code, `docs/workflow.md`).
- Server test files follow the layout `server/tests/<area>.<action>.test.ts`
  (for example `auth.login.test.ts`). The F-04 to F-09 contracts and tests use the same layout.

**Completion outcome.**

- `sprint-1` is released to `main` through a reviewed PR and tagged.
- The release runs locally from the README (D-25: PostgreSQL in Docker, server and client with `npm run dev`).
- Login, logout and current user work with two roles, 2-hour sessions and bcrypt passwords.
- The full journey works through UI, API and database: advisor creates a slot, student
  lists and books it, student opens the booking, advisor sees the student's name and opens
  the booking.
- Rule rejections and forbidden operations are enforced by the server and tested
  (AC-F01 to AC-F09, AC-R01 to AC-R04).
- The Playwright E2E journey passes against the release.
- Test results are kept for the release commit. Incomplete work is disclosed.
- Checkpoint: Deliverable 1, 8 Nov 2026, 23:59.

### 2.1 Why this is the Sprint 1 scope

The handout asks for a small working domain slice with authentication, permissions and
persistence (Deliverable 1 section 3.4). The slice is chosen as follows.

- **It is the shortest path to one real domain transaction.** A booking needs a slot
  (F-04), a way for the student to find it (F-06) and the booking itself (F-07). F-05,
  F-08 and F-09 let each role read back the saved result, which the handout requires
  ("retrieve its persisted result").
- **It contains the hardest rules.** One active booking per slot under concurrency
  (BR-05, NFR-04), the booking deadline (BR-06, NFR-05), one active booking per student
  (BR-07) and the late slot rule (BR-16) are all in F-04 and F-07. Doing them first
  means Sprints 2 and 3 only reuse them (cancel, reschedule and batch creation call the
  same rule functions).
- **It carries all of the access control.** Both roles, 401, 403 and 404 ownership
  checks (NFR-02, NFR-03) are built once in R-01, so later endpoints only reuse them.
- **It leaves out everything that changes or removes a booking.** Cancel, reschedule,
  edit and delete (F-10 to F-15) add rules that depend on the booking existing, so they
  come after it works. Filters, summary, history and notifications (F-16 to F-19) are
  read-only views or a side effect and add no new core rule except FR-19.
- **Feasibility.** Sprint 1 has 9 features for two people in the days before 8 Nov, with
  F-01 to F-03 small and F-04 to F-09 each carrying a few rules. To keep it feasible:
  every feature has a contract with planned AC and tests (`docs/traceability.md`
  section 3), the work is split between the two students (Issues in the board), and
  Docker, GCP and CI/CD are left to Lab 5 as the handout allows (Deliverable 1
  section 2). If the release is at risk, the cut line (decision D-27) is F-08 and F-09's UI
  screens, not the API, rules or tests; such a cut would be disclosed.

## 3. Sprint 2: change and cancel

**Goal.** Complete the core booking life cycle: a booking can be cancelled by either side,
moved to another slot, and advisors can maintain their slots. The application is also
packaged and deployed.

**Features.**

| Group | Features |
|---|---|
| Cancel | F-10 Student cancels booking, F-11 Advisor cancels booking |
| Reschedule | F-14 Reschedule booking |
| Slot maintenance | F-12 Edit slot, F-13 Delete slot, F-15 Batch create slots |
| Responsibilities | R-01 and R-02 extended to every new endpoint; R-04 Docker and GCP; R-03 re-checked before release |

**Requirements added.** FR-10 to FR-15, BR-11 to BR-15, NFR-09, and the GCP part of NFR-06.

**Dependencies.**

| Feature | Depends on |
|---|---|
| F-10 | F-07, F-09 |
| F-11 | F-07, F-09 |
| F-12 | F-04 |
| F-13 | F-04 |
| F-14 | F-07, F-10 |
| F-15 | F-04 |

- All Sprint 1 features are released first. F-10, F-11 and F-14 reuse the booking rules
  (BR-05, BR-06, BR-07, BR-16) built in Sprint 1; F-12 and F-15 reuse the slot rules
  of F-04.
- F-14 needs F-10 (its cancel check, BR-11) and is the last Sprint 2 feature to build.
- Open item before F-12 starts: SDS O-03 (does editing a start time recompute `isLate`?)
  needs a team decision recorded as the next D-xx.
- Sprint 2 contracts (AC, STS) are written before the code, as in Sprint 1.

**Completion outcome.**

- A student cancels up to 12 hours before the start; an advisor cancels with a reason
  until the slot starts; a freed slot is bookable again only if its deadline has not passed.
- A booked slot cannot be edited or deleted. A reschedule is all-or-nothing.
- Batch creation applies the F-04 rules to each slot.
- Every new endpoint returns 401 without a session and 403 or 404 for the wrong role or
  owner (R-01 extended).
- The application builds into a Docker image and runs on GCP with durable storage; data
  survives a restart and redeployment (NFR-06, NFR-09, Lab 5).
- Sprint 2 is released to `main`. Checkpoint: Deliverable 2, 29 Nov 2026.

## 4. Sprint 3: views, history and notification

**Goal.** Add the remaining views and the notification feature, measure and harden the
product, and finish the baseline.

**Features.**

| Group | Features |
|---|---|
| Views | F-16 Filter bookable slots, F-17 Appointment summary, F-18 Cancellation history |
| Notification | F-19 Late-slot notification |
| Responsibilities | R-02 re-verified (NFR-07 E2E checks); R-04 performance measurement (NFR-10); R-01 and R-03 re-checked |

**Requirements added.** FR-16 to FR-19, the notification part of BR-16, NFR-10, and the
Sprint 3 part of NFR-07.

**Dependencies.**

| Feature | Depends on |
|---|---|
| F-16 | F-06 |
| F-17 | F-05, F-10, F-11 |
| F-18 | F-08, F-10, F-11 |
| F-19 | F-04, F-15 |

- F-16 needs only Sprint 1 work, so it can start early if Sprint 2 slips. F-17, F-18
  and F-19 need the Sprint 2 cancel and batch features.
- NFR-10 needs the deployed GCP service from Sprint 2 and 1,000 seeded slots.

**Completion outcome.**

- A student filters bookable slots by advisor and date. An advisor sees counts and the
  upcoming appointments for a date range. Both roles see cancelled bookings with who
  cancelled and the reason.
- Creating a late slot sends an in-app notification to every student; students list them
  and mark them as read. No external messaging.
- E2E tests show the server's message in the UI for the cancel window, a failed reschedule
  and an unbookable late slot (NFR-07).
- The bookable-slot list returns in under 500 ms (p95 of 50 requests) with 1,000 seeded
  slots on GCP (NFR-10).
- Final release on `main`. Progress is shown at 29 Nov 2026; the sprint is complete by
  13 Dec 2026.

## 5. Cross-cutting responsibilities by sprint

| ID | Sprint 1 | Sprint 2 | Sprint 3 |
|---|---|---|---|
| R-01 Authentication and authorization | Established: middleware, role matrix, tests for all Sprint 1 endpoints | Extended to each new endpoint | Extended to each new endpoint |
| R-02 Error handling | Established: central handler, error shape tests, E2E check | Applied to new rejections | Re-verified (NFR-07 E2E checks) |
| R-03 Configuration and secrets | Established: `.env.example`, secret scan | Re-checked before release | Re-checked before release |
| R-04 Persistence and deployment | Local persistence (restart check) | Docker image and GCP deployment | Performance measurement (NFR-10) |

## 6. Coverage of the baseline

| Sprint | Features | FR | BR | NFR |
|---|---|---|---|---|
| 1 | F-01 to F-09 | FR-01 to FR-09 | BR-01 to BR-10, BR-16 (rule) | NFR-01 to NFR-08 |
| 2 | F-10 to F-15 | FR-10 to FR-15 | BR-11 to BR-15 | NFR-06 (GCP), NFR-09 |
| 3 | F-16 to F-19 | FR-16 to FR-19 | BR-16 (notification) | NFR-07 (Sprint 3 check), NFR-10 |

Together: 19 of 19 features, 19 of 19 FR, 16 of 16 BR and 10 of 10 NFR are planned in a
sprint, which matches the coverage check in `docs/traceability.md` section 4.
