# AdviseSlot: Final release notes (v1.0.0)

| Item | Value |
|---|---|
| Course | CPE 334, Semester 1/2026, Group Project |
| Release | `v1.0.0` (tag on `main`, see section 7). The final release for the Final Project Delivery. |
| Tested commit | `sprint-3` at `d12ecfd` (merge of PR #117), the last code merge so far. **TODO (Jeerasak, 6 Dec):** replace with the final `sprint-3` commit of the release PR if anything merges after `d12ecfd` (for example UAT fixes from the `v1.0.0-rc` re-test). |
| Issues | #110 (`sprint-3` and CI), #114 (F-17), #112 (F-18), #116 (F-19), #75 (F-16, already in `v0.3.0-rc`). **TODO:** the release Issue number. |
| Related documents | `docs/sprints/sprint-3/release-notes-rc.md` (previous release `v0.3.0-rc`), `docs/sprints/sprint-3/final-delivery-plan.md`, `docs/sprints/sprint-2/definition-of-done.md` (release checks), `docs/traceability.md`, `docs/labs/lab-05/deployment.md` |

## Version history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-26 | Chanat (drafted with an AI agent) | First draft (Final Delivery plan task P5), written before the release. The tag, release commit, test run on that commit and deploy URL are TODOs for the release on 6 Dec. Awaiting team review. |

## 1. What is new since `v0.3.0-rc`

`v0.3.0-rc` had F-01 to F-16. This release adds the last three Sprint 3 features, so all of
F-01 to F-19 are in it. Sprint 3 work went into `sprint-3`, created from `sprint-2` (#111), so
this release is one release PR, `sprint-3` into `main`.

| Item | Requirements | Issue | PR | Author | Reviewer (merged) |
|---|---|---|---|---|---|
| F-17 Appointment summary: `GET /api/summary`, `/summary` page, E2E step | FR-17, BR-08, BR-09, NFR-03, NFR-05, NFR-07 (D-33) | #114 | #115 | Jeerasak | Chanat |
| F-18 Cancellation history: `GET /api/bookings/history`, `/history` page, "Cancelled by you" label, E2E step | FR-18, BR-09, NFR-03 | #112 | #113 | Chanat | Jeerasak |
| F-19 Late-slot notification: `Notification` table, notifications on late-slot create, `/notifications` page with unread badge, E2E step | FR-19, BR-16 (notification), BR-09, NFR-03 (D-32) | #116 | #117 | Chanat | Jeerasak |
| `sprint-3` branch and CI on it | | #110 | #111 | Jeerasak | Chanat |
| Final Delivery plan | | #108 | #109 | Chanat | Jeerasak |
| Final SRS v1.0, features v1.0, SDS v1.0, F-16 to F-19 contracts, these notes | | **TODO** | **TODO** | Chanat | Jeerasak |

**TODO (6 Dec):** add any PR merged into `sprint-3` after this draft (UAT fixes, NFR-10 script,
release evidence).

### 1.1 What users see

| Who | New in this release |
|---|---|
| Advisor | A **Summary** link: for a range of days (default today to today + 6, at most 90 days) the number of slots, booked, cancelled and open, and the upcoming appointments with a link to each booking. |
| Advisor | A **History** link: cancelled and passed bookings on own slots, newest first, with the student, who cancelled and the reason. Bookings on deleted slots stay listed. |
| Student | On **My bookings**, a booking the student cancelled shows "Cancelled by you"; one the advisor cancelled keeps "Cancelled by <advisor>: <reason>". |
| Student | A **Notifications** link with an unread badge. When an advisor creates a late slot (BR-16), every student gets one notification with the advisor, date and time, a Book link while the slot can still be booked, and Mark as read. |

### 1.2 API changes

All new endpoints are behind `requireAuth` and a role check, and are in the R-01 401 test list.
No existing endpoint changes its request or response.

| Method and path | Role | Feature |
|---|---|---|
| `GET /api/summary?from=YYYY-MM-DD&to=YYYY-MM-DD` | Advisor | F-17 |
| `GET /api/bookings/history` | Advisor | F-18 |
| `GET /api/notifications` | Student | F-19 |
| `POST /api/notifications/:id/read` | Student owner | F-19 |

`POST /api/slots` (F-04) and `POST /api/slots/batch` (F-15) now also write the notifications
for late slots in the same transaction; their responses do not change. No new error codes.

### 1.3 Schema and migrations

| Migration | Change | Data |
|---|---|---|
| `20261126091653_add_notification` (F-19) | New table `Notification` (`id`, `studentId`, `slotId`, `message`, `createdAt`, `readAt`), unique index on (`studentId`, `slotId`), index on (`studentId`, `createdAt`), foreign keys to `User` and `Slot` (restrict) | New table only. No change to existing tables and no backfill: late slots created before this release send no notification. |

F-17 and F-18 need no migration (they read the existing `Slot` and `Booking` columns). The seed
is unchanged. The migration was checked on a clean database (`evidence/f19-migrate-clean.txt`).

## 2. Test results (DoD R2, R3)

On `sprint-3` commit `d12ecfd`, CI run 45802912186 ("CI & Docker Build", 2026-11-26):

| Command | Result |
|---|---|
| `cd server && npm test` | 27 files, 377 passed, 0 failed, 0 skipped |
| `cd e2e && npx playwright test` | 13 passed, 0 failed, 0 skipped |
| Server and client build, Docker image build | OK |

All planned Sprint 3 tests exist: TEST-F16-01 to -06, TEST-F17-01 to -06, TEST-F18-01 to -06 and
TEST-F19-01 to -07, plus the R-01 rows for the four new endpoints. The E2E journey keeps every
Sprint 1 and Sprint 2 step and adds the F-17, F-18 and F-19 steps.

**TODO (Jeerasak, plan task S5, 7 Dec):** the same table for the final release commit, saved as
`evidence/release-v1-tests.txt`, if that commit is not `d12ecfd`.

## 3. Release checks

The Sprint 2 DoD release checks (section 3), applied to the final release:

| DoD | Check | Result | Evidence |
|---|---|---|---|
| R1 | F-16 to F-19 Done | Issues #75, #112, #114, #116 closed, PRs merged by the teammate. FR-17 to FR-19 status in `docs/traceability.md` (plan task P4) | Board, traceability matrix |
| R2 | E2E journey passes | Passed (13/13) on `d12ecfd`, including the F-17, F-18 and F-19 steps | CI run 45802912186 |
| R3 | Build and tests on the release commit | Passed on `d12ecfd`. **TODO:** final commit | Section 2 |
| R4 | Restart check (TEST-R04-01) | **TODO** (6 Dec): a saved booking, a cancellation and a notification read the same after a server stop and a database restart | `evidence/r04-restart-v1.txt` |
| R5 | Fresh clone follows the README | **TODO:** the reviewer, on the release PR, including the new migration | Release PR review |
| R6 | Release PR reviewed, CI green, merged by the teammate, tagged `v1.0.0` | **TODO** (6 Dec) | Section 7 |
| R7 | GCP deploy (`deploy.yml`: CI, image, migrate job, Cloud Run update, smoke test) | **TODO** (6 Dec) | Deploy run link |
| R8 | Post-deploy check: `/api/version` returns the release commit, the footer shows it, a Sprint 3 path works on the deployed app, earlier data is still there after the redeploy | **TODO** (6 Dec) | `evidence/post-deploy-v1.txt` |
| R9 | A failed deploy is rolled back with `image_tag` | Only if needed | Rollback run link |
| R10 | Participation and AI use | Both of us authored and reviewed PRs (section 1). AI use: section 6 | Final Delivery Part B |

UAT re-test on `v1.0.0-rc` with Team Top 2 (plan task S6, 4 to 5 Dec): **TODO**, link the record
and list any fix and its re-test here.

## 4. Upgrade and deploy

From `v0.3.0-rc` (or any earlier release) to `v1.0.0`:

1. **Deployed (GCP).** Merge the release PR into `main`. `deploy.yml` runs CI, builds and pushes
   the image tagged with the commit SHA, runs the migrate job (`prisma migrate deploy && prisma
   db seed`), then updates the Cloud Run service and smoke-tests it (`deploy/release.sh`). The
   migrate job applies `add_notification`; if it fails, the service is not updated, so users stay
   on the old version. Nothing to do by hand. Cloud SQL must be running
   (`docs/labs/lab-05/deployment.md`).
2. **Local development.** `git pull`, then in `server/`: `npm install`, `npx prisma migrate dev`
   (applies `add_notification` and regenerates the Prisma client), optionally `npx prisma db seed`
   (idempotent). Then `npm run dev` in `server/` and `client/` as in the README.
3. **Docker only.** `docker compose --profile app up --build` (applies the migrations and seeds on
   start, README).
4. **Tests.** `cd server && npm test` migrates the `_test` database before the run; the E2E setup
   also empties the `Notification` table.
5. **Rollback.** Run "Deploy demo" by hand with `image_tag` = the full commit SHA of the
   `v0.3.0-rc` image. Rollback skips the migration. The `Notification` table stays and the old
   code does not read it, so the rollback is safe; notifications written by `v1.0.0` come back
   when `v1.0.0` is deployed again.

No new environment variable. `SEED_DEMO_PASSWORD` and `DATABASE_URL` stay as in Lab 5.

## 5. Known issues and limitations

From the Sprint 3 contracts (section 9 of each):

- F-16 filters one advisor and one day at a time; no date range, no paging. The advisor list shows
  every advisor, also one with no open slots.
- F-17: no paging or export; a range is at most 90 days (D-33). Closed and ended-unbooked slots
  have no count of their own (`slots` minus `booked` minus `open`).
- F-18: no paging. The advisor history reads every booking on the advisor's slots and drops the
  Upcoming ones in code; fine at the course data size. A rescheduled booking's old row reads
  "Cancelled by you" with no link to the new booking.
- F-19: moving a normal slot to a late time with F-12 sends no notification (D-28, D-32). Students
  created after a late slot get no notification for it. No delete and no "mark all as read". The
  badge updates after login and after a change on `/notifications`, not live.

Found while writing these notes (for the traceability matrix, plan task P4):

- **NFR-07, Sprint 3 check:** the SRS asks for E2E checks that the UI shows the server's message for
  the cancel window (BR-11), a failed reschedule (BR-15) and an unbookable late slot (BR-16). The
  journey has no such step; these cases are covered by API tests only. The F-16 and F-17 steps do
  show a 400 message on the page. A BR-16 E2E step cannot be timed on the real clock (F-19 contract
  v0.3).
- **NFR-10** (bookable list p95 under 500 ms with 1,000 slots on GCP) is not measured yet (plan task
  S4, 7 Dec). **TODO:** result.

Carried over from earlier releases:

- F-11 (advisor cancel) and F-14 (reschedule) have no E2E step; their STS plans none.
- The client has no unit tests; the UI is covered by the Playwright journey only.

**TODO (6 Dec):** defects from the UAT re-test that are not fixed in this release, with severity
(plan task S7).

## 6. AI use

Code, tests and docs were drafted with AI agents (Claude Code) and reviewed, run and committed by
us. Each version-history row that was AI-drafted says so. Every PR was merged by the teammate who
reviewed it (section 1), and nothing was posted to GitHub without the author reading the text
first (`docs/workflow.md`).

## 7. Release record

The tag `v1.0.0` goes on the merge commit of the release PR (`sprint-3` into `main`).

| Item | Value |
|---|---|
| Release PR | **TODO** (Jeerasak, 6 Dec) |
| Tag | `v1.0.0` on **TODO** (merge commit ID) |
| Deploy run | **TODO** (link to the "Deploy demo" run) |
| Deployed URL and version | **TODO** (Cloud Run URL; `/api/version` must return the merge commit) |

If these values are filled in after the tag, they go in a follow-up PR or in the Final Delivery
PDF, so the tagged tree is not changed after the release.
