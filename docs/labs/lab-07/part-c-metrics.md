# Lab 7 Part C: objective engineering metrics

| Item | Value |
|---|---|
| Project | AdviseSlot (CPE 334 group project, Theme 1), repository `Chanat-888/AdviseSlot` |
| Scope | This repository only: Issues, PRs and GitHub Actions runs of `Chanat-888/AdviseSlot` |
| Observation window | **Fri 20 Nov 2026 19:50 to Mon 23 Nov 2026 19:00 (Asia/Bangkok)**: from just after the Lab 6 release (PR #65 merged 19:49, `c4dc3b4`) to just after the Lab 7 release (PR #90 merged 18:51, `198a1ea`, tag `v0.2.0-sprint-2`) and its deploy |
| Snapshot | Test results: commit `198a1ea`. UAT defects: status at Mon 23 Nov 19:00 |
| Collected | 2026-11-23 from the GitHub API (`gh issue list`, `gh pr view`, `gh run list`, `gh run view --log`) and `git merge-base`; times converted to Asia/Bangkok |
| Author | Jeerasak (drafted with an AI agent), for review by Chanat |

## 1. Summary

| ID | Metric | Definition | Value |
|---|---|---|---|
| C-01 | Completed Issues | Issues closed in the window, by close reason. Duplicates and not-planned closures listed separately. | **11** closed, all "completed"; 0 duplicate, 0 not planned (section 2) |
| C-02 | Merged PRs | PRs merged in the window, by target branch, with who merged and whether the CI-tested head was up to date with the target branch at merge time. | **15** merged: 1 into `sprint-1`, 13 into `sprint-2`, 1 into `main`. 15 of 15 merged by the reviewer, not the author. **2 of 15** merged with a tested head behind the target (#84, #85) (section 3) |
| C-03 | Automated test results | Pass/fail/skip counts of the CI job `test / test-and-docker` on the release commit `198a1ea` (run 45168953657). | Server (Vitest): **292 passed, 0 failed, 0 skipped** in 22 files. E2E (Playwright): **9 passed, 0 failed, 0 skipped**. Client unit tests: none exist (section 4) |
| C-04 | UAT defect status | UAT Issues filed by the UAT Team (Team Top 2) against our app: opened and resolved in the window, and open at the snapshot. Resolved = fix merged and deployed, UAT Team retest PASS, Issue closed. | Opened in window **0**; resolved in window **1** (#63, Major, duplicate of #58); open at snapshot **0** (section 5) |
| C-05 | CI run outcomes | GitHub Actions runs started in the window, all branches, by workflow and conclusion. | **30** runs: 28 success, 2 cancelled, 0 failed. `CI & Docker Build` (pull requests) 29: 27 success, 2 cancelled; `Deploy demo` (push to `main`) 1: success. Success rate of finished non-cancelled runs: 28 / 28 (section 6) |

## 2. C-01 Completed Issues (source list)

`gh issue list --state closed`, closed between Fri 20 Nov 19:50 and Mon 23 Nov 19:00. GitHub close reason in the third column.

| Issue | Closed (Bangkok) | Reason | Title |
|---|---|---|---|
| #63 | Sun 22 Nov 11:00 | completed | [UAT] Logout button does not sign user out or redirect until manual page refresh |
| #60 | Sun 22 Nov 21:10 | completed | Lab 6: Sprint 1 UAT documents (Parts A to D) |
| #78 | Sun 22 Nov 22:50 | completed | CI: run on pull requests into sprint-2 |
| #73 | Mon 23 Nov 14:03 | completed | F-13 Delete slot: implementation |
| #68 | Mon 23 Nov 14:45 | completed | Sprint 2 contracts F-10 to F-15 and Sprint 2 DoD |
| #69 | Mon 23 Nov 14:45 | completed | F-10 Student cancels booking: implementation |
| #70 | Mon 23 Nov 15:18 | completed | F-11 Advisor cancels booking: implementation |
| #74 | Mon 23 Nov 16:23 | completed | F-15 Batch create slots: implementation |
| #72 | Mon 23 Nov 17:04 | completed | F-12 Edit slot: implementation |
| #71 | Mon 23 Nov 17:41 | completed | F-14 Reschedule booking: implementation |
| #67 | Mon 23 Nov 18:51 | completed | Lab 7 change request: BR-07 allows 2 active bookings, at most 1 per advisor |

11 Issues: 6 feature implementations (#69 to #74), 1 contracts and DoD (#68), 1 CI chore (#78), 1 Lab 6 documents (#60), 1 UAT defect (#63) and the Lab 7 change request (#67, closed by the release PR #90 into `main`). GitHub records #63 as "completed"; in the Lab 6 triage it is a duplicate of our own #58 (Part C of Lab 6), closed after the UAT Team's passing retest. No Issue was closed as a duplicate or not planned.

## 3. C-02 Merged PRs (source list)

`gh pr view` per PR. "Tested head" = the PR head commit that CI ran on; "up to date" = the target branch's head just before the merge (first parent of the merge commit) is an ancestor of that tested head (`git merge-base --is-ancestor`). Every PR below had a successful `CI & Docker Build` run on its tested head.

| PR | Merged (Bangkok) | Into | Author | Merged by | Tested head vs target | Title |
|---|---|---|---|---|---|---|
| #66 | Sun 22 Nov 21:10 | sprint-1 | Chanat-888 | ShitheadQuin | up-to-date | docs: Lab 6 results, #63 retest and the c4dc3b4 release |
| #79 | Sun 22 Nov 22:49 | sprint-2 | Chanat-888 | ShitheadQuin | up-to-date | chore: run CI on pull requests into sprint-2 |
| #76 | Sun 22 Nov 23:12 | sprint-2 | Chanat-888 | ShitheadQuin | up-to-date | docs: Sprint 2 contracts F-10, F-11, F-14 |
| #77 | Sun 22 Nov 23:56 | sprint-2 | ShitheadQuin | Chanat-888 | up-to-date | docs: Sprint 2 contracts F-12, F-13, F-15 |
| #80 | Mon 23 Nov 12:39 | sprint-2 | Chanat-888 | ShitheadQuin | up-to-date | docs: BR-07 contract for change request #67 (2 bookings, 1 per advisor) |
| #82 | Mon 23 Nov 13:14 | sprint-2 | Chanat-888 | ShitheadQuin | up-to-date | fix: BR-07 allows 2 active bookings, at most 1 per advisor (#67) |
| #81 | Mon 23 Nov 14:02 | sprint-2 | ShitheadQuin | Chanat-888 | up-to-date | feat: F-13 delete slot (soft delete, BR-14) and slot lock in F-07 |
| #83 | Mon 23 Nov 14:45 | sprint-2 | Chanat-888 | ShitheadQuin | up-to-date | docs: Sprint 2 Definition of Done (#68) |
| #84 | Mon 23 Nov 14:45 | sprint-2 | Chanat-888 | ShitheadQuin | BEHIND | F-10 Student cancels booking (#69) |
| #86 | Mon 23 Nov 15:17 | sprint-2 | Chanat-888 | ShitheadQuin | up-to-date | F-11 Advisor cancels booking (#70) |
| #85 | Mon 23 Nov 16:22 | sprint-2 | ShitheadQuin | Chanat-888 | BEHIND | feat: F-15 batch create slots (all-or-nothing, D-30) (#74) |
| #87 | Mon 23 Nov 17:02 | sprint-2 | ShitheadQuin | Chanat-888 | up-to-date | feat: F-12 edit slot (D-28 isLate recomputed, BR-14) (#72) |
| #88 | Mon 23 Nov 17:41 | sprint-2 | Chanat-888 | ShitheadQuin | up-to-date | F-14 Reschedule booking (#71) |
| #89 | Mon 23 Nov 18:42 | sprint-2 | Chanat-888 | ShitheadQuin | up-to-date | docs: Sprint 2 release notes, traceability v0.8, release evidence (#67) |
| #90 | Mon 23 Nov 18:51 | main | Chanat-888 | ShitheadQuin | up-to-date | release: Sprint 2 (v0.2.0-sprint-2) |

15 PRs: `sprint-1` 1 (#66), `sprint-2` 13, `main` 1 (#90). Author and merger differ in 15 of 15 (our rule: the reviewer merges).

The two "BEHIND" merges:

| PR | Tested head | Target head before merge | Missing from the tested head | Combined code first tested |
|---|---|---|---|---|
| #84 (F-10) | `aeb7587` | `ebacb52` (#83) | #83: Sprint 2 DoD, docs only | CI of #86 on `e05dd5c` (up to date), 23 Nov 15:06 |
| #85 (F-15) | `a61e464` | `db4b30d` (#86) | #86: F-11 advisor cancel, server and client code | CI of #87 on `2c6086a` (up to date), 23 Nov 16:55, 33 minutes after the merge at 16:22 |

## 4. C-03 Automated test results on `198a1ea` (source)

Run 45168953657 (`Deploy demo`, push to `main`, commit `198a1ea`), job `test / test-and-docker`, which calls `.github/workflows/ci-docker.yml`. Steps and commands:

- "Server - install, migrate, seed, build, test (Prisma + Vitest)": `cd server && npm test` (Vitest 2.1.5, Node 24, PostgreSQL service). Log, 23 Nov 18:54:07:

```
 Test Files  22 passed (22)
      Tests  292 passed (292)
   Duration  96.60s (transform 247ms, setup 0ms, collect 7.17s, tests 86.25s, environment 3ms, prepare 784ms)
```

- "E2E - Playwright journey": `cd e2e && npm test` (Playwright, Chromium). Log, 23 Nov 18:54:42:

```
  9 passed (22.6s)
```

Vitest and Playwright print a failed or skipped count only when it is not zero; neither does here. The client has no unit tests (`client/package.json` has no `test` script), so its only automated check is the production build and the E2E journey. The same suite ran on `209af9a` before the release PR with the same counts (`evidence/release-sprint-2-tests.txt`); C-03 uses only the `198a1ea` run, the released commit.

## 5. C-04 UAT defect status (source)

UAT Team: Team Top 2 (GitHub @Ryugc), Lab 6. Records: Issues on this repository and `docs/labs/lab-06/part-c-defects-triage.md`, `part-d-resolution-retest.md`.

| Issue | Filed by | Opened (Bangkok) | Severity | Triage | Fix | Retest | Closed (Bangkok) | Status at snapshot |
|---|---|---|---|---|---|---|---|---|
| #63 | UAT Team | Fri 20 Nov 17:56 (before the window) | Major | Duplicate of #58 (Logout disabled after a second login in the same tab) | PR #59 for #58, released in `c4dc3b4` (PR #65) | UAT Team PASS on `c4dc3b4` / `adviseslot-00005-4tw`, 22 Nov | Sun 22 Nov 11:00 | Resolved, closed |

No other UAT Issue was filed. Opened in the window: 0. Resolved in the window: 1 (#63). Open at Mon 23 Nov 19:00: 0. Our own #58 (found by us before UAT) was closed on 19 Nov, before the window, and is not counted.

## 6. C-05 CI run outcomes (source list)

`gh run list --created 2026-11-20..2026-11-23`, runs started between Fri 20 Nov 19:50 and Mon 23 Nov 19:00, all branches. The Lab 6 deploy (run 44739029326, 19:49) is before the window.

| Run | Started (Bangkok) | Workflow | Event | Branch | Commit | Conclusion |
|---|---|---|---|---|---|---|
| 44983493416 | Sun 22 Nov 11:05 | CI & Docker Build | pull_request | docs/lab6-results | 45cd17f | success |
| 44983992536 | Sun 22 Nov 11:12 | CI & Docker Build | pull_request | docs/lab6-results | 296450a | cancelled |
| 44984086253 | Sun 22 Nov 11:13 | CI & Docker Build | pull_request | docs/lab6-results | 9e268db | cancelled |
| 44984104085 | Sun 22 Nov 11:13 | CI & Docker Build | pull_request | docs/lab6-results | c92b1f4 | success |
| 44984299455 | Sun 22 Nov 11:16 | CI & Docker Build | pull_request | docs/lab6-results | 4b6b197 | success |
| 44984499520 | Sun 22 Nov 11:18 | CI & Docker Build | pull_request | docs/lab6-results | ce3a441 | success |
| 45028414671 | Sun 22 Nov 20:36 | CI & Docker Build | pull_request | docs/lab6-results | 9f13321 | success |
| 45039408131 | Sun 22 Nov 22:38 | CI & Docker Build | pull_request | chore/ci-sprint-2 | 05f9faf | success |
| 45041318270 | Sun 22 Nov 22:59 | CI & Docker Build | pull_request | docs/sprint-2-contracts | d7b132a | success |
| 45042011471 | Sun 22 Nov 23:07 | CI & Docker Build | pull_request | docs/sprint-2-contracts | 2bc7798 | success |
| 45042546475 | Sun 22 Nov 23:12 | CI & Docker Build | pull_request | docs/sprint-2-contracts-slots | 9e91547 | success |
| 45045081482 | Sun 22 Nov 23:39 | CI & Docker Build | pull_request | docs/sprint-2-contracts-slots | cc452ec | success |
| 45048426221 | Mon 23 Nov 00:15 | CI & Docker Build | pull_request | docs/lab7-br07-contract | 00e8a5d | success |
| 45049753212 | Mon 23 Nov 00:29 | CI & Docker Build | pull_request | docs/lab7-br07-contract | e341010 | success |
| 45120298451 | Mon 23 Nov 12:50 | CI & Docker Build | pull_request | feat/f13-delete-slot | d920918 | success |
| 45121280232 | Mon 23 Nov 13:00 | CI & Docker Build | pull_request | fix/lab7-br07 | 91ba0c6 | success |
| 45123063212 | Mon 23 Nov 13:17 | CI & Docker Build | pull_request | feat/f13-delete-slot | 3229bca | success |
| 45130431557 | Mon 23 Nov 14:20 | CI & Docker Build | pull_request | docs/sprint-2-dod | 89b21f5 | success |
| 45130473012 | Mon 23 Nov 14:21 | CI & Docker Build | pull_request | feat/f10-student-cancel | d1d7743 | success |
| 45132593098 | Mon 23 Nov 14:38 | CI & Docker Build | pull_request | docs/sprint-2-dod | 38c4577 | success |
| 45132800673 | Mon 23 Nov 14:40 | CI & Docker Build | pull_request | feat/f10-student-cancel | aeb7587 | success |
| 45134685207 | Mon 23 Nov 14:55 | CI & Docker Build | pull_request | feat/f15-batch-create | a61e464 | success |
| 45135930357 | Mon 23 Nov 15:06 | CI & Docker Build | pull_request | feat/f11-advisor-cancel | e05dd5c | success |
| 45151310578 | Mon 23 Nov 16:55 | CI & Docker Build | pull_request | feat/f12-edit-slot | 2c6086a | success |
| 45151583671 | Mon 23 Nov 16:56 | CI & Docker Build | pull_request | feat/f14-reschedule | 2986a83 | success |
| 45153491581 | Mon 23 Nov 17:09 | CI & Docker Build | pull_request | feat/f14-reschedule | 74185d2 | success |
| 45163445371 | Mon 23 Nov 18:14 | CI & Docker Build | pull_request | docs/release-sprint-2 | 983b0f8 | success |
| 45166931459 | Mon 23 Nov 18:37 | CI & Docker Build | pull_request | docs/release-sprint-2 | 3e27b3f | success |
| 45167903874 | Mon 23 Nov 18:44 | CI & Docker Build | pull_request | sprint-2 | cac5beb | success |
| 45168953657 | Mon 23 Nov 18:51 | Deploy demo | push | main | 198a1ea | success |

30 runs: 28 success, 2 cancelled, 0 failed. Both cancelled runs are on `docs/lab6-results` (PR #66) on 22 Nov at 11:12 and 11:13, replaced by a newer push to the same PR (the workflow cancels an older run of the same branch); the next run, at 11:13, succeeded. Every `CI & Docker Build` run has the event `pull_request`: the workflow runs on pull requests into `sprint-1`, `sprint-2` and `main` only, not on a push to `sprint-2` (`ci-docker.yml`, `on: pull_request`).

## 7. Interpretation and action

CI runs only on pull requests, never on a push to `sprint-2` (C-05: all 29 CI runs are `pull_request`), so a PR tested behind `sprint-2` merges an untested combination. C-02 shows 2 of 15 merges did; for #85, F-15 with F-11 had no CI result for 33 minutes. The 28 / 28 green runs overstate integration coverage. Action: Jeerasak adds `push: branches: [sprint-2]` to `ci-docker.yml`, and the team turns on "require branches to be up to date" for `sprint-2`, before the `v0.3.0-rc` release for Deliverable 2.
