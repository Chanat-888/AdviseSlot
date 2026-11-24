# AdviseSlot: Release candidate release notes (v0.3.0-rc)

| Item | Value |
|---|---|
| Course | CPE 334, Semester 1/2026, Group Project |
| Release | `v0.3.0-rc` (tag on `main`, see section 6). The integrated release candidate for Deliverable 2. |
| Tested commit | `sprint-2` at `90dae53` (merge of PR #96). This release prep PR adds only docs and evidence, no code. |
| Issues | #102 (this release), #75 (F-16), #92 (F-18/F-19 contracts), #95, #99 (F-17 contract), #67 (Lab 7 Part C) |
| Related documents | `docs/sprints/sprint-2/release-notes.md` (previous release `v0.2.0-sprint-2`), `docs/sprints/sprint-2/definition-of-done.md` (release checks), `docs/traceability.md` (v0.10), `docs/labs/lab-05/deployment.md` |

## Version history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-23 | Chanat (drafted with an AI agent) | First release notes for the release candidate. Awaiting team review. |
| 0.2 | 2026-11-23 | Chanat (drafted with an AI agent) | Review of PR #103: the F-16 contract row lists the contract's linked requirements (FR-16, FR-06, BR-06, BR-09, BR-16 rule, NFR-03, NFR-05, NFR-07); NFR-10 removed, since F-16 does not claim it. |

## 1. What is in this release

Everything in `v0.2.0-sprint-2` (F-01 to F-15, Lab 7 BR-07), plus the first Sprint 3 work.
Sprint 3 work went into `sprint-2`, the current integration branch, so this candidate is
one release PR, `sprint-2` into `main`.

| Item | Requirements | Issue | PR | Author |
|---|---|---|---|---|
| F-16 Filter bookable slots by advisor and date: contract | FR-16, FR-06, BR-06, BR-09, BR-16 (rule), NFR-03, NFR-05, NFR-07 | #75 | #94 | Jeerasak |
| F-16 Filter bookable slots: code, tests, E2E step | FR-16 | #75 | #98 | Jeerasak |
| F-17 Appointment summary: contract (no code yet) | FR-17 | #99 | #100 | Jeerasak |
| F-18 Cancellation history and F-19 Late-slot notification: contracts (no code yet), D-32 | FR-18, FR-19, BR-09, BR-16 | #92 | #93 | Chanat |
| Lab 6 UAT results forward-merged from `sprint-1` | FR-02 (#58, #63) | #95 | #97 | Chanat |
| Features v0.4, traceability v0.9, README for BR-07 (D-31) | BR-07 | #95 | #96 | Chanat |
| Sprint 2 post-deploy evidence | NFR-06, NFR-09 | #67 | #91 | Chanat |
| Lab 7 Part C metrics | | #67 | #101 | Jeerasak |

No schema migration since `v0.2.0-sprint-2`. F-16 adds one endpoint, `GET /api/advisors`
(students only), and the `advisorId` and `date` query parameters on `GET /api/slots/bookable`.

## 2. Test results (DoD R2, R3)

On `sprint-2` commit `90dae53`, 2026-11-23 (`evidence/release-rc-tests.txt`):

| Command | Result |
|---|---|
| `cd server && npm test` | 24 files, 330 passed, 0 failed, 0 skipped |
| `cd server && npm run build` | OK |
| `cd client && npm run build` | OK |
| `cd e2e && npx playwright test` | 10 passed, 0 failed, 0 skipped |

All 6 planned F-16 tests (TEST-F16-01 to TEST-F16-06) exist in `server/tests` or `e2e/tests`.
The E2E journey keeps every Sprint 1 and Sprint 2 step and adds the F-16 filter step.

## 3. Release checks

The Sprint 2 DoD release checks (section 3), applied to the candidate:

| DoD | Check | Result | Evidence |
|---|---|---|---|
| R1 | F-16 Done | Issue #75 closed. FR-16 is Verified (Sprint 3) in `docs/traceability.md` v0.10 | Board, traceability matrix |
| R2 | E2E journey passes | Passed (10/10), including the new F-16 step: a student filters by advisor, then by date, and sees only matching slots | `evidence/release-rc-tests.txt` |
| R3 | Build and tests on the release commit | Passed on `90dae53` | `evidence/release-rc-tests.txt` |
| R4 | Restart check (TEST-R04-01) | Passed: an Upcoming booking, a Cancelled booking with its `cancellation`, and the F-16 filtered list (`advisorId`) read the same before and after a server stop and a database container restart | `evidence/r04-restart-rc.txt` |
| R5 | Fresh clone follows the README | To be done by the reviewer (Jeerasak) on the release PR | Release PR review |
| R6 | Release PR reviewed, CI green, merged by the teammate, tagged | After this PR | Section 6 |
| R7 | GCP deploy | After the release PR merges (`deploy.yml`) | Deploy run link in Deliverable 2 |
| R8 | Post-deploy check | After the deploy | `evidence/post-deploy-rc.txt` |
| R10 | Participation and AI use | Both of us authored and reviewed PRs (section 1). AI use: section 5 | Deliverable 2 |

## 4. Known limitations

- F-17, F-18 and F-19 have reviewed contracts but no code yet; they are planned for the
  final release (Deliverable 2, remaining-work plan).
- F-16 filters one advisor and one day at a time; no date range, no paging. The advisor list
  shows every advisor, also one with no open slots (F-16 section 9).
- NFR-10 (bookable-list performance) is not measured yet.
- Carried over from `v0.2.0-sprint-2`: no cancellation history (F-18) or notifications (F-19);
  F-11 and F-14 have no E2E step; the client has no unit tests.

## 5. AI use

Code, tests and docs were drafted with AI agents (Claude Code) and reviewed, run and committed by
us. Each version-history row that was AI-drafted says so. Agents did not merge PRs or post to
GitHub without the author reading the text first (`docs/workflow.md`).

## 6. Release record

The tag `v0.3.0-rc` goes on the merge commit of the release PR (`sprint-2` into `main`).
The release PR number, that commit ID, the tag and the deploy run are recorded in
Deliverable 2 and in `evidence/post-deploy-rc.txt`, not in this file, so the tagged tree is
the one these notes describe.
