# AdviseSlot: Sprint 2 release notes

| Item | Value |
|---|---|
| Course | CPE 334, Semester 1/2026, Group Project |
| Release | `v0.2.0-sprint-2` (tag on `main`, see section 6) |
| Tested commit | `sprint-2` at `209af9a` (merge of PR #88). This release prep PR adds only docs and evidence, no code. |
| Issues | #67 (Lab 7), #68 to #74 |
| Related documents | `docs/sprints/sprint-2/definition-of-done.md`, `docs/traceability.md` (v0.8), `docs/labs/lab-05/deployment.md` |

## Version history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-23 | Chanat (drafted with an AI agent) | First release notes for Sprint 2. Awaiting team review. |

## 1. What is in this release

All six Sprint 2 features and the Lab 7 change request, through UI, API and database:

| Feature | Requirements | Issue | PR | Author |
|---|---|---|---|---|
| F-10 Student cancels booking | FR-10, BR-11, BR-13 | #69 | #84 | Chanat |
| F-11 Advisor cancels booking | FR-11, BR-12, BR-13 | #70 | #86 | Chanat |
| F-12 Edit slot | FR-12, BR-01 to BR-04, BR-14, BR-16 (rule, D-28) | #72 | #87 | Jeerasak |
| F-13 Delete slot (soft delete) | FR-13, BR-08, BR-14 | #73 | #81 | Jeerasak |
| F-14 Reschedule booking | FR-14, BR-15, BR-05, BR-07, BR-11 | #71 | #88 | Chanat |
| F-15 Batch create slots | FR-15, BR-01 to BR-04, BR-16 (rule, D-30) | #74 | #85 | Jeerasak |
| Lab 7: BR-07 allows 2 active bookings, at most 1 per advisor | BR-07 (D-31) | #67 | #80 (contract), #82 (code) | Chanat |

Also: Sprint 2 contracts (#76, #77), Definition of Done (#83, Issue #68), CI on PRs into
`sprint-2` (#79, Issue #78). One schema migration: `20261123070837_add_booking_cancel`
(cancel fields on `Booking`).

## 2. Test results (DoD R2, R3)

On `sprint-2` commit `209af9a`, 2026-11-23 (`evidence/release-sprint-2-tests.txt`):

| Command | Result |
|---|---|
| `cd server && npm test` | 22 files, 292 passed, 0 failed, 0 skipped |
| `cd server && npm run build` | OK |
| `cd client && npm run build` | OK |
| `cd e2e && npx playwright test` | 9 passed, 0 failed, 0 skipped |

All 40 planned Sprint 2 tests (TEST-F10-01 to TEST-F15-07) exist in `server/tests` or
`e2e/tests`. The E2E journey adds Sprint 2 steps for student cancel from the detail page
(F-10), batch create (F-15), delete (F-13) and edit (F-12), and keeps the Lab 7
second-booking step.

## 3. Release checks

| DoD | Check | Result | Evidence |
|---|---|---|---|
| R1 | F-10 to F-15 Done | Issues #69 to #74 closed, cards in Done. FR-10 to FR-15 and BR-11 to BR-15 are Verified (Sprint 2) in `docs/traceability.md` v0.8 | Board, traceability matrix |
| R2 | E2E journey passes | Passed (9/9), including the F-10 step: a student cancels from the detail page and sees "Cancelled" | `evidence/release-sprint-2-tests.txt` |
| R3 | Build and tests on the release commit | Passed on `209af9a` | `evidence/release-sprint-2-tests.txt` |
| R4 | Restart check (TEST-R04-01) | Passed: an Upcoming booking and a Cancelled booking with its `cancellation` read the same before and after a server stop and a database container restart | `evidence/r04-restart-sprint-2.txt` |
| R5 | Fresh clone follows the README | To be done by the reviewer (Jeerasak) on the release PR | Release PR review |
| R6 | Release PR reviewed, CI green, merged by the teammate, tagged | After this PR | Section 6 |
| R7 | GCP deploy | After the release PR merges (`deploy.yml`) | Deploy run link on #67 |
| R8 | Post-deploy check | After the deploy | `evidence/post-deploy-sprint-2.txt` |
| R10 | Participation and AI use | Both of us authored and reviewed PRs (section 1). AI use: section 5 | Deliverable 2 |

## 4. Known limitations

From the feature contracts (section 9 of each):

- A student cannot give a reason when cancelling (F-10). An advisor's reason cannot be edited, and the student is not notified; they see it when they open the booking (F-11).
- Cancelled bookings are not listed as history yet (F-18, Sprint 3); the detail page shows the `cancellation` object.
- After a reschedule, the old booking shows as "Cancelled by student" with no link to the new one (F-14).
- Edit changes only the start time. A booked slot must be cancelled before it can be edited. An edit that makes a slot late sends no notification (F-12, D-28).
- Delete has no undo; deleted slots stay in the database (F-13).
- Batch create covers one date and is all-or-nothing (F-15, D-30). No late-slot notification until F-19 (Sprint 3).
- No filters or paging (F-16, Sprint 3). NFR-10 is measured in Sprint 3.

Found during this release:

- F-11 (advisor cancel) and F-14 (reschedule) have no E2E step; their STS plans none, so they are covered by API tests only.
- The client still has no unit tests (`client` has no `npm test`), as in Sprint 1. The UI is covered by the Playwright journey only.

## 5. AI use

Code, tests and docs were drafted with AI agents (Claude Code) and reviewed, run and committed by
us. Each version-history row that was AI-drafted says so. Agents did not merge PRs or post to
GitHub without the author reading the text first (`docs/workflow.md`).

## 6. Release record

The tag `v0.2.0-sprint-2` goes on the merge commit of the release PR (`sprint-2` into `main`).
The release PR number, that commit ID, the tag and the deploy run are recorded on Issue #67 and
in Deliverable 2, not in this file, so the tagged tree is the one these notes describe.
