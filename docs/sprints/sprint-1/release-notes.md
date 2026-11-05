# AdviseSlot: Sprint 1 release notes

| Item | Value |
|---|---|
| Course | CPE 334, Semester 1/2026, Group Project |
| Release | `v0.1.0-sprint-1` (tag on `main`, see section 6) |
| Tested commit | `sprint-1` at `aa87c4a` (merge of PR #29). PR #30 and this release prep PR add only docs and evidence, no code. |
| Issue | #14 |
| Related documents | `docs/sprints/sprint-1/definition-of-done.md`, `docs/traceability.md` (v0.5), `docs/sprints/plan.md` |

## Version history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-05 | Jeerasak (drafted with an AI agent) | First release notes for Sprint 1. Awaiting team review. |

## 1. What is in this release

All nine Sprint 1 features, through UI, API and database:

| Feature | Requirements | Issue | PR |
|---|---|---|---|
| F-01 Log in | FR-01, BR-10, NFR-01, NFR-02 | #8 | #22, #28 (evidence) |
| F-02 Log out, F-03 Current user | FR-02, FR-03 | #9 | #23 |
| F-04 Create slot, F-05 View own slots | FR-04, FR-05, BR-01 to BR-04, BR-08, BR-16 (rule) | #10 | #25 |
| F-06 View bookable slots, F-07 Book slot | FR-06, FR-07, BR-05 to BR-07, BR-09, BR-16 (rule), NFR-04, NFR-05 | #11 | #26 |
| F-08 View own bookings, F-09 Booking detail | FR-08, FR-09, BR-07, BR-09, NFR-03 | #12 | #27 |

Cross-cutting responsibilities: R-01 (auth and access), R-02 (error format), R-03 (no secrets)
established, and R-04 local persistence (Issue #17, PR #29). E2E journey: Issue #13, PRs #24, #27, #28.
Seed data: Issue #7, PR #20. Contracts: Issues #4, #5, #6, PRs #18, #21.

The D-27 cut line was not needed: the F-08 and F-09 screens shipped.

## 2. Test results (DoD R2, R3)

On `sprint-1` commit `aa87c4a`, 2026-11-05 (`evidence/release-sprint-1-tests.txt`):

| Command | Result |
|---|---|
| `cd server && npm test` | 15 files, 165 passed, 0 failed, 0 skipped |
| `cd server && npm run build` | OK |
| `cd client && npm run build` | OK |
| `cd e2e && npx playwright test`, run twice | 5 passed, 0 failed, 0 skipped, both runs |

The E2E journey covers login, advisor creates a slot, student books it, both open the booking,
a rule rejection shows its message (BR-07), a forbidden operation is refused, and logout.

## 3. Release checks

| DoD | Check | Result | Evidence |
|---|---|---|---|
| R1 | F-01 to F-09 Done | Issues #4 to #13 and #17 closed, cards in Done. Every Sprint 1 row of `docs/traceability.md` v0.5 is Verified (Sprint 1) or Verified (Sprint 1 part) | Board, traceability matrix |
| R2 | E2E journey passes | Passed (5/5, twice) | `evidence/release-sprint-1-tests.txt` |
| R3 | Build and tests on the release commit | Passed on `aa87c4a` | `evidence/release-sprint-1-tests.txt` |
| R4 | Restart check (TEST-R04-01) | Passed twice, on each of our machines: booking 1 read the same before and after a server stop and a database container restart | `evidence/r04-restart.txt` (Pan, PR #30), `evidence/r04-restart-2.txt` (Jeerasak, with the container start times) |
| R5 | Fresh clone follows the README | To be done by the reviewer (Pan) on the release PR | Release PR review |
| R6 | Release PR reviewed and merged by the teammate, tagged | After this PR | Section 6 |
| R7 | Participation and AI use | Both of us authored and reviewed PRs (section 1). AI use: see section 5 | Deliverable 1 Part F (#15) |
| — | Secret scan (TEST-R03-01) | Passed, part of `npm test` | `server/tests/r03.secrets.test.ts` |

## 4. Known limitations

From the feature contracts (section 9 of each):

- Expired `Session` rows are not deleted; a 401 only clears the cookie (F-01, F-03).
- Logging in again does not revoke earlier sessions (F-01).
- No editing, deleting or batch creation of slots (F-12, F-13, F-15, Sprint 2).
- No cancel or reschedule; a booking stays active until its slot ends (F-10, F-11, F-14, Sprint 2).
- Creating a late slot sends no notification (FR-19, Sprint 3). Public holidays are not blocked (A-06).
- No filters or paging on slot and booking lists (F-16, Sprint 3). NFR-10 is measured in Sprint 3.
- `BOOKING_DEADLINE_PASSED` is also the answer for a slot that has started or ended.

Found during this release:

- The client has no unit tests (`client` has no `npm test`). The UI is covered by the
  Playwright journey only. DoD row 4 asks for client tests.
- The client does not hide `/schedule` from a student; the server refuses it (403) and the page
  shows that message. Authorization is on the server as R-01 requires.
- Runs locally only (D-25). Docker image and GCP deployment are Sprint 2 (Lab 5).

## 5. AI use

Code, tests and docs were drafted with AI agents (Claude Code) and reviewed, run and committed by
us. Each version-history row that was AI-drafted says so. Agents did not merge PRs or post to
GitHub without the author reading the text first (`docs/workflow.md`).

## 6. Release record

The tag `v0.1.0-sprint-1` goes on the merge commit of the release PR (`sprint-1` into `main`).
The release PR number, that commit ID and the tag are recorded on Issue #14 and in Deliverable 1
(#15), not in this file, so the tagged tree is the one these notes describe.
