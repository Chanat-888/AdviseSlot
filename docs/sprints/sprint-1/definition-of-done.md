# AdviseSlot: Product Definition of Done (Sprint 1)

| Item | Value |
|---|---|
| Course | CPE 334, Semester 1/2026, Group Project |
| Owner of this document | Chanat Dachkhumhang (reviewer: Jeerasak Phisawong) |
| Applies to | Every Sprint 1 feature F-01 to F-09, and the Sprint 1 release |
| Related documents | `docs/workflow.md`, `docs/traceability.md`, `docs/sprints/sprint-1/` contracts |

## Version history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-04 | Chanat (drafted with an AI agent) | First Product DoD from Deliverable 1 section 3.5. Awaiting team review. |
| 0.2 | 2026-11-04 | Chanat (drafted with an AI agent) | Row 3 states the test file layout for all Sprint 1 features. |
| 0.3 | 2026-11-05 | Jeerasak (drafted with an AI agent) | Section 3.1: steps for the R4 restart check (TEST-R04-01). Row 8 evidence names the secret scan file. Issue #17. |
| 0.4 | 2026-11-05 | Jeerasak (drafted with an AI agent) | Section 3.1 step 3: restart the running database container by name and check the server is really down. On the release run `docker compose restart db` hit a stopped container from another folder. Issue #14. |

## 1. Rule

A feature is Done only when every row of section 2 is true and the evidence is recorded.
Evidence means test output, commit IDs, PR links and screenshots. An AI agent's statement
that something works is not evidence. If a row cannot be met, the feature is not Done: the
gap is written in the PR description and in the Known limitations of the release.

## 2. Feature checklist

| # | Criterion | Evidence |
|---|---|---|
| 1 | **Contract first.** The feature contract (this folder) with AC and STS is committed and reviewed before the implementation commits, so the Git history shows spec, then tests, then code. | Commit IDs and dates of the contract and of the implementation. |
| 2 | **Required behavior implemented.** Every FR, BR and NFR linked in the contract works as written, through the layers it names (UI, API, database), including the negative and boundary cases and the role restrictions. | The AC table of the contract, each AC ticked with its TEST result. |
| 3 | **Planned verification executed.** Every planned TEST in the contract's STS exists in the repo and was run. The AC-to-test table lists planned test ID, actual test file and name, and result. No planned test is dropped or weakened. Server test files follow `server/tests/<area>.<action>.test.ts` (for example `auth.login.test.ts`); F-04 to F-09 follow it too. | AC-to-test results table. |
| 4 | **Meaningful tests pass.** `npm test` (server and client) passes on the PR branch and again on `sprint-1` after merge. Assertions check observable outcomes (status, body, stored rows), not just that code runs. Failed or skipped tests are reported, not hidden. | Command, commit ID, pass/fail/skip counts. |
| 5 | **TDD evidence for rule work.** For rule logic (for example BR-05, BR-06, BR-07, BR-10, BR-16) the intended-behavior test is shown failing before the fix and passing after it. | Failing run and passing run, with commit IDs. |
| 6 | **Access control enforced on the server.** Unauthenticated requests return 401, wrong role 403, other users' records 404 (SDS section 6), with no private data. The user id and role come from the session, never from the request. | API tests for 401, 403, 404 cases (TEST-R01-01 and the feature's own). |
| 7 | **Errors use the SDS format.** Rejections return 4xx with `code` and `message`, with no stack trace or SQL error. The UI shows the server's message. | API shape test (TEST-R02-01), E2E check (TEST-R02-02). |
| 8 | **No secrets.** No real password, token or key in Git or client code. Configuration comes from environment variables, with `.env.example` placeholders. | PR checklist (`.github/pull_request_template.md`), secret scan (TEST-R03-01, `server/tests/r03.secrets.test.ts`). |
| 9 | **Build passes.** Server and client build without errors. | `npm run build` output. |
| 10 | **Reviewed by the teammate.** The PR into `sprint-1` has a teammate review with at least one specific check, question or finding, and every comment is answered. The author does not approve their own PR. | PR link, review comment. |
| 11 | **Integrated by the reviewer.** The reviewer merges the PR into `sprint-1` (`docs/workflow.md`). The branch was updated from `sprint-1` and the tests were green before the merge. | Merge commit on `sprint-1`. |
| 12 | **Issue and board current.** The Issue is linked to the PR, the contract and the branch, the card is in Done, and the Issue is closed by hand. | Issue link, board state. |
| 13 | **Setup and documents current.** The README (dependencies, `.env.example`, database setup, migrations, seed, run, build and test commands) and the affected docs (SDS, traceability status) match the code. A changed contract has a new version-history row that says what changed and why. | README and doc diffs in the PR. |
| 14 | **Incomplete work disclosed.** Anything not done, any known defect, and any failed or skipped test is listed in the PR and in the Known limitations of the release. | PR description, release notes. |

## 3. Sprint 1 release checklist

The release (`sprint-1` into `main`) is Done when, in addition:

| # | Criterion | Evidence |
|---|---|---|
| R1 | Features F-01 to F-09 are each Done under section 2, or the exceptions are listed. | Board, Known limitations. |
| R2 | The Playwright E2E journey passes on the release commit: login, advisor creates a slot, student books it, both retrieve the booking, a rule rejection shows its message, a forbidden operation is refused, logout. | E2E output. |
| R3 | Full build and test commands were run on the exact release commit. Counts of passed, failed and skipped tests are kept. | Command output with commit ID. |
| R4 | The persisted result survives a server restart (NFR-06, AC-R04-01). | Manual restart check, recorded. |
| R5 | A fresh clone can follow the README to run the app with the documented seed accounts. | README steps tried by the reviewer. |
| R6 | The release PR is reviewed by the teammate and merged into `main` by the reviewer. The release is tagged and the tag and commit are recorded. | Tag name, commit ID. |
| R7 | Both students have meaningful participation, shown in Issues, PRs and the contribution table. AI use is declared briefly. | Contribution table. |

### 3.1 R4 restart check (TEST-R04-01, AC-R04-01, NFR-06)

Manual, on the release commit, against the dev database (`docker compose`, port 5433).
It shows that a booking is stored in PostgreSQL, not in server memory, and survives both a
server restart and a database container restart.

1. Start the database and the server (README "Setup" and "Run"). Seed if needed:
   `cd server && npx prisma db seed`.
2. Log in as a student who has a booking and save the cookie. The seed gives `student2` one.

   ```bash
   curl -s -c jar.txt -H "Content-Type: application/json" \
     -d '{"email":"student2@example.test","password":"AdviseSlot-demo-2026"}' \
     http://localhost:3000/api/auth/login
   curl -s -b jar.txt http://localhost:3000/api/bookings/mine > before.json
   ```

   Note the booking `id` in `before.json` and get its detail:
   `curl -s -b jar.txt http://localhost:3000/api/bookings/<id> > detail-before.json`.
3. Stop the server (Ctrl+C in its terminal) and check that `/api/health` no longer answers.
   Restart the database container that is actually running on port 5433, by name:
   `docker ps` to find it, then `docker restart <name>`, and wait until `docker ps` shows it
   healthy. (`docker compose restart db` only works from the folder that started it.) Note
   its `docker inspect -f '{{.State.StartedAt}}' <name>` before and after as proof.
4. Start the server again (`cd server && npm run dev`).
5. Log in again (same command as step 2, the session may also still be valid) and repeat the
   two requests into `after.json` and `detail-after.json`.
6. Pass if `before.json` equals `after.json` and `detail-before.json` equals
   `detail-after.json` (`diff` prints nothing). Delete `jar.txt` afterwards.

Record in the release evidence (`evidence/r04-restart.txt`): date, commit ID, the booking id,
the commands run and the `diff` output.

## 4. What "Done" does not mean

- It does not mean Docker, CI/CD or GCP deployment. These are Lab 5 and Sprint 2 (`docs/sprints/plan.md`).
- It does not mean Sprint 2 or Sprint 3 features. Their contracts and DoD checks come in those sprints.
