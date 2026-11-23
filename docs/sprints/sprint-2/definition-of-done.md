# AdviseSlot: Product Definition of Done (Sprint 2)

| Item | Value |
|---|---|
| Course | CPE 334, Semester 1/2026, Group Project |
| Owner of this document | Chanat Dachkhumhang (reviewer: Jeerasak Phisawong) |
| Applies to | Every Sprint 2 feature F-10 to F-15, and the Sprint 2 release (`sprint-2` into `main`, deployed to GCP) |
| Related documents | `docs/workflow.md`, `docs/traceability.md`, `docs/system-sds.md`, `docs/sprints/sprint-2/` contracts, `docs/sprints/sprint-1/definition-of-done.md`, `docs/labs/lab-05/deployment.md` |

## Version history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-23 | Chanat (drafted with an AI agent) | First Sprint 2 DoD, built on the Sprint 1 DoD (v0.4). Adds the Sprint 2 rows: migration checked, R-01 route inventory, lock order student then slot, CI green on the PR, GCP deploy and post-deploy check. Issue #68. Awaiting team review. |

## 1. Rule

A feature is Done only when every row of section 2 is true and the evidence is recorded.
Evidence means test output, commit IDs, PR links, CI runs and screenshots. An AI agent's
statement that something works is not evidence. If a row cannot be met, the feature is not
Done: the gap is written in the PR description and in the Known limitations of the release.

Rows 1 to 14 are the Sprint 1 rows, with `sprint-1` read as `sprint-2`. Rows 15 to 19 are new
in Sprint 2. A row that does not apply to a feature (for example row 15 for a feature with no
schema change) is marked "n/a" in the PR with one line saying why.

## 2. Feature checklist

| # | Criterion | Evidence |
|---|---|---|
| 1 | **Contract first.** The feature contract (this folder) with AC and STS is committed and reviewed before the implementation commits, so the Git history shows spec, then tests, then code. | Commit IDs and dates of the contract and of the implementation. |
| 2 | **Required behavior implemented.** Every FR, BR and NFR linked in the contract works as written, through the layers it names (UI, API, database), including the negative and boundary cases and the role restrictions. | The AC table of the contract, each AC ticked with its TEST result. |
| 3 | **Planned verification executed.** Every planned TEST in the contract's STS exists in the repo and was run. The AC-to-test table lists planned test ID, actual test file and name, and result. No planned test is dropped or weakened. Server test files follow `server/tests/<area>.<action>.test.ts` (for example `bookings.cancel.test.ts`, `slots.batch.test.ts`). | AC-to-test results table. |
| 4 | **Meaningful tests pass.** `npm test` (server and client) passes on the PR branch and again on `sprint-2` after merge. Assertions check observable outcomes (status, body, stored rows), not just that code runs. Failed or skipped tests are reported, not hidden. The Sprint 1 and Lab 7 tests still pass (regression). | Command, commit ID, pass/fail/skip counts. |
| 5 | **TDD evidence for rule work.** For rule logic (BR-11, BR-12, BR-13, BR-14, BR-15, and the F-12 / F-15 reuse of the F-04 rules) the intended-behavior test is shown failing before the code and passing after it. The red run fails on assertions or on the 404 of a missing route, never on a compile or type error. | Red run and green run with commit IDs, saved in `evidence-sprint2/` (for example `F-10-red-<sha>.txt`, `F-10-green-<sha>.txt`). |
| 6 | **Access control enforced on the server.** Unauthenticated requests return 401, wrong role 403, other users' records 404 (SDS section 6), with no private data. The user id and role come from the session, never from the request. | API tests for 401, 403, 404 cases (TEST-R01-01 and the feature's own). |
| 7 | **Errors use the SDS format.** Rejections return 4xx with `code` and `message`, with no stack trace or SQL error. New codes (`BOOKING_NOT_ACTIVE`, `CANCEL_WINDOW_PASSED`, `SLOT_HAS_ACTIVE_BOOKING`, `SLOT_ALREADY_STARTED`) are listed in SDS section 5. The UI shows the server's message. | API tests of the new codes, E2E check where the contract has one. |
| 8 | **No secrets.** No real password, token or key in Git or client code. Configuration comes from environment variables, with `.env.example` placeholders. | PR checklist (`.github/pull_request_template.md`), secret scan (TEST-R03-01, `server/tests/r03.secrets.test.ts`). |
| 9 | **Build passes.** Server and client build without errors. | `npm run build` output. |
| 10 | **Reviewed by the teammate.** The PR into `sprint-2` has a teammate review with at least one specific check, question or finding, and every comment is answered. The author does not approve their own PR. | PR link, review comment. |
| 11 | **Integrated by the reviewer.** The reviewer merges the PR into `sprint-2` (`docs/workflow.md`). The branch was updated from `sprint-2` and the tests were green before the merge. | Merge commit on `sprint-2`. |
| 12 | **Issue and board current.** The Issue is linked to the PR, the contract and the branch, the card is in Done, and the Issue is closed by hand. | Issue link, board state. |
| 13 | **Setup and documents current.** The README and the affected docs (SDS, traceability status) match the code. A changed contract has a new version-history row that says what changed and why. | README and doc diffs in the PR. |
| 14 | **Incomplete work disclosed.** Anything not done, any known defect, and any failed or skipped test is listed in the PR and in the Known limitations of the release. | PR description, release notes. |
| 15 | **Migration checked.** A schema change is one Prisma migration made with `prisma migrate dev --name <name>`, with any raw SQL (CHECK, index) in the same migration as the contract's Data section says. It applies cleanly with `prisma migrate deploy` to a database at the previous `sprint-2` state, existing rows satisfy the new constraints without a backfill (or the backfill is in the migration), and a test shows the database rejects a row that breaks each new CHECK. | Migration file name in the PR, `migrate deploy` output (CI log or local), the constraint test. |
| 16 | **R-01 route inventory updated.** Each new route is added to `PROTECTED` in `server/tests/r01.auth.test.ts` (or to `PUBLIC` with a reason), so TEST-R01-01 calls it without a session and gets 401, and the route inventory test passes. The Sprint 2 routes: `POST /api/bookings/:id/cancel` (F-10, F-11), `PATCH /api/slots/:id` (F-12), `DELETE /api/slots/:id` (F-13), `POST /api/bookings/:id/reschedule` (F-14), `POST /api/slots/batch` (F-15). | Diff of `r01.auth.test.ts`, test output. |
| 17 | **Lock order student then slot.** A transaction that locks rows does it in the SDS section 3.1 order: the student's `User` row first, then the `Slot` row(s), never the other way round. Booking (F-07) and reschedule (F-14) lock student then slot; cancel (F-10, F-11) uses the same order for any row it locks; edit (F-12) and delete (F-13) lock only the slot. A race the contract names (parallel cancel, edit or delete against a booking) has a test, and conditional updates (`WHERE status = 'ACTIVE'`) are used where the contract says. | Code lines in the PR description, the race test. |
| 18 | **CI green on the PR.** The `test-and-docker` check (`.github/workflows/ci-docker.yml`: server migrate, seed, build and tests, client build, Playwright E2E, deploy-script tests, Dockerfile build) passes on the last commit of the PR into `sprint-2` before the reviewer merges. A red run is fixed on the branch, not bypassed. | Link to the passing CI run. |
| 19 | **E2E kept current.** If the contract's STS adds a Playwright step, it is in `e2e/tests/journey.spec.ts` and passes locally and in CI. | E2E output. |

## 3. Sprint 2 release checklist

The release (`sprint-2` into `main`, then the deploy to GCP) is Done when, in addition:

| # | Criterion | Evidence |
|---|---|---|
| R1 | Features F-10 to F-15 are each Done under section 2, or the exceptions are listed. | Board, Known limitations. |
| R2 | The Playwright E2E journey passes on the release commit, including the Sprint 2 steps the contracts add (for example a student cancels from the detail page). | E2E output. |
| R3 | Full build and test commands were run on the exact release commit. Counts of passed, failed and skipped tests are kept. | Command output with commit ID. |
| R4 | The persisted result survives a server restart (NFR-06, AC-R04-01), as in Sprint 1 DoD section 3.1, and a cancelled booking keeps its `cancellation` after the restart. | Manual restart check, recorded in `evidence-sprint2/r04-restart.txt`. |
| R5 | A fresh clone can follow the README to run the app with the documented seed accounts, including the new migration. | README steps tried by the reviewer. |
| R6 | The release PR is reviewed by the teammate, CI is green on it, and the reviewer merges it into `main`. The release is tagged and the tag and commit are recorded. | Tag name, commit ID, CI run. |
| R7 | **GCP deploy.** The push to `main` runs `deploy.yml` ("Deploy demo"): CI, image build, `deploy/release.sh` (migrate job, then the Cloud Run service update) and `deploy/smoke_test.py` all pass. The migration of section 2 row 15 is applied to Cloud SQL by the migrate job. | Deploy run link, image tag and digest, Cloud Run revision name. |
| R8 | **Post-deploy check.** On the public URL: `/api/version` returns the release commit, the footer shows the same short SHA, and a manual run of one Sprint 2 path works on the deployed app (a student logs in, cancels a booking more than 12 hours ahead, and sees "Cancelled"). Seeded data from before the release is still there (NFR-06, NFR-09). | `curl` output of `/api/version`, screenshot, date and commit, in `evidence-sprint2/post-deploy.txt`. |
| R9 | A failed deploy is rolled back with the `image_tag` input (`docs/labs/lab-05/deployment.md`, Roll back), and the release is not Done until a deploy passes. | Rollback run link, if one was needed. |
| R10 | Both students have meaningful participation, shown in Issues, PRs and the contribution table. AI use is declared briefly. | Contribution table. |

## 4. What "Done" does not mean

- It does not mean Sprint 3 features (F-16 to F-19) or the NFR-10 performance measurement. Their contracts and DoD checks come in Sprint 3.
- It does not mean the history view of cancelled bookings (F-18). In Sprint 2 the detail page shows the `cancellation` object only.
