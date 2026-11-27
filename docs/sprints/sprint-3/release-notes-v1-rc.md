# AdviseSlot: Release candidate release notes (v1.0.0-rc)

| Item | Value |
|---|---|
| Course | CPE 334, Semester 1/2026, Group Project |
| Release | `v1.0.0-rc` (tag on `main`, see section 6). The release candidate for the Final Delivery, re-tested by Team Top 2 before `v1.0.0` (Final Delivery plan S6). |
| Tested commit | `sprint-3` at `d12ecfd` (merge of PR #117). This release prep PR adds only docs and evidence, no code. |
| Issues | #118 (this release), #110 (CI on `sprint-3`), #112 (F-18), #114 (F-17), #116 (F-19) |
| Related documents | `docs/sprints/sprint-3/release-notes-rc.md` (previous release `v0.3.0-rc`), `docs/sprints/sprint-3/final-delivery-plan.md` (S6, S3), `docs/sprints/sprint-2/definition-of-done.md` (release checks), `docs/labs/lab-05/deployment.md` |

## Version history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-26 | Jeerasak (drafted with an AI agent) | First release notes for the Final Delivery release candidate. Awaiting team review. |
| 0.2 | 2026-11-27 | Jeerasak (drafted with an AI agent) | Review of PR #119 and #122: section 1 lists #119, #121 and the sync PR #125; section 3 fills in R5 to R8 after the release (#122, `f567fb7`, tag `v1.0.0-rc`, `evidence/post-deploy-v1-rc.txt`) and adds R9 (rollback); section 5 uses the AI-use wording of the `v1.0.0` notes (#121). |

## 1. What is in this release

Everything in `v0.3.0-rc` (F-01 to F-16, Lab 7 BR-07), plus the rest of Sprint 3. All four
Sprint 3 features are now built, tested and merged into `sprint-3`.

| Item | Requirements | Issue | PR | Author | Reviewed and merged by |
|---|---|---|---|---|---|
| RC post-deploy evidence for `v0.3.0-rc` (R7, R8) | NFR-06, NFR-09 | #102 | #107 | Jeerasak | Chanat |
| Final Delivery plan (who does what, dates) | | | #109 | Chanat | Jeerasak |
| CI on `sprint-3` (pull request and push) | | #110 | #111 | Jeerasak | Chanat |
| F-18 Cancellation history: code, tests, E2E step | FR-18, BR-09, NFR-03 | #112 | #113 | Chanat | Jeerasak |
| F-17 Appointment summary: code, tests, E2E step | FR-17, BR-08, BR-09, NFR-03, NFR-05, NFR-07 | #114 | #115 | Jeerasak | Chanat |
| F-19 Late-slot notification: code, tests, E2E step | FR-19, BR-16 (notification), BR-09, NFR-03 | #116 | #117 | Chanat | Jeerasak |
| These release notes and the RC evidence (R2, R3, R4) | | #118 | #119 | Jeerasak | Chanat |
| Final SRS, features and SDS v1.0, F-16 to F-19 contracts, `v1.0.0` notes draft | | #120 | #121 | Chanat | Jeerasak |
| Sync: `main` into `sprint-3`, so the release PR #122 is up to date (no file change) | | #118 | #125 | Jeerasak | Chanat |

**Schema migration:** one new migration since `v0.3.0-rc`, `20261126091653_add_notification`
(F-19, a new `Notification` table). `deploy.yml` applies it with the migrate job before the new
revision gets traffic. It only adds a table; no existing row changes.

**New endpoints:** `GET /api/summary?from=&to=` (advisors, F-17), `GET /api/bookings/history`
(advisors, F-18), `GET /api/notifications` and `POST /api/notifications/:id/read` (students,
F-19). All four are in the R-01 route inventory test, so each one answers 401 without a session.

## 2. Test results (DoD R2, R3)

On `sprint-3` commit `d12ecfd`, 2026-11-26 (`evidence/release-v1-rc-tests.txt`):

| Command | Result |
|---|---|
| `cd server && npm test` | 27 files, 377 passed, 0 failed, 0 skipped |
| `cd server && npm run build` | OK |
| `cd client && npm run build` | OK |
| `cd e2e && npx playwright test` | 13 passed, 0 failed, 0 skipped |

The push CI run on `d12ecfd` also passed (run 45802912186).
The E2E journey keeps every earlier step and adds the F-18, F-17 and F-19 steps.

## 3. Release checks

The Sprint 2 DoD release checks (section 3), applied to the candidate:

| DoD | Check | Result | Evidence |
|---|---|---|---|
| R1 | F-17, F-18, F-19 Done | Issues #112, #114, #116 closed, PRs reviewed and merged by the teammate. The FR-17 to FR-19 rows in `docs/traceability.md` are still "Allocated"; they are updated with the final commit in plan task P4 (Chanat) | Board, contracts |
| R2 | E2E journey passes | Passed (13/13), including the F-18, F-17 and F-19 steps | `evidence/release-v1-rc-tests.txt` |
| R3 | Build and tests on the release commit | Passed on `d12ecfd` | `evidence/release-v1-rc-tests.txt` |
| R4 | Restart check (TEST-R04-01) | Passed on a new, migrated, seeded database: a Cancelled booking with its `cancellation`, the advisor's history (F-18), the summary (F-17), a read notification (F-19) and the F-16 filtered list read the same before and after a server stop and a database container restart | `evidence/r04-restart-v1-rc.txt` |
| R5 | Fresh clone follows the README | Passed: Chanat, on the release PR #122 (6 migrations, seed, 377 passed, E2E 13) | Review of #122, `evidence/post-deploy-v1-rc.txt` |
| R6 | Release PR reviewed, CI green, merged by the teammate, tagged | #122 approved and merged by Chanat as `f567fb7`; tag `v1.0.0-rc` | Section 6 |
| R7 | GCP deploy | Passed: deploy run 45858377155, migrate job applied `add_notification`, revision `adviseslot-00008-8cj`, smoke test PASS | `evidence/post-deploy-v1-rc.txt` |
| R8 | Post-deploy check | Passed: `/api/version` and the footer show `f567fb7`; F-17, F-18 and F-19 work on the live site; a student gets 403 on the advisor endpoints; bookings made before the release are still there | `evidence/post-deploy-v1-rc.txt`, `evidence/post-deploy-v1-rc/` |
| R9 | A failed deploy is rolled back with `image_tag` | Not needed (the deploy passed). Rollback target: the `v0.3.0-rc` image `87be717…`; the rollback skips the migrate job and the old code ignores the `Notification` table | `docs/labs/lab-05/deployment.md` |
| R10 | Participation and AI use | Both of us authored and reviewed PRs (section 1). AI use: section 5 | Final Delivery Part B |

The R4 check inserts the notification row directly in the database, because a late slot can be
made only in a short real-clock window (F-19 contract v0.3). Creating notifications is covered
by TEST-F19-01 to TEST-F19-04 with a fake clock.

Next, testers from another team (Team Top 2 in Lab 6) re-test this version (plan S6): the Lab 6
UAT cases and the Sprint 2 and 3 journeys, with tester, expected and actual result, and version.

## 4. Known limitations

- NFR-10 (bookable-list performance) is not measured yet (plan S4, on the deployed final version).
- F-17: the count labels use `aria-labelledby` on a plain `div` (review of PR #115).
- F-18: no paging; the history query reads all of the advisor's bookings and drops the Upcoming
  ones in code (F-18 section 9).
- F-19: no paging; the top-bar badge loads the whole list to get the unread count. Moving a slot
  to a late time with F-12 sends no notification, and students created after a late slot get
  none for it (F-19 section 9).
- A slot that has notifications cannot be hard-deleted in the database (restrict foreign key);
  the app only soft-deletes slots (F-13), so this does not affect users.
- Carried over: F-11 and F-14 have no E2E step; the client has no unit tests.

## 5. AI use

Code, tests and docs were drafted with AI agents (Claude Code) and reviewed, run and committed by
us. Each version-history row that was AI-drafted says so. Every PR was merged by the teammate who
reviewed it (section 1), and nothing was posted to GitHub without the author reading the text
first (`docs/workflow.md`).

## 6. Release record

The tag `v1.0.0-rc` goes on the merge commit of the release PR (`sprint-3` into `main`).
The release PR number, that commit ID, the tag and the deploy run are recorded in the
post-deploy evidence, not in this file, so the tagged tree is the one these notes describe.
