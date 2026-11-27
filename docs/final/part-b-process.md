# AdviseSlot: Final Delivery Part B, process and team evidence

| Item | Value |
|---|---|
| Course | CPE 334, Semester 1/2026, Group Project, Final Project Delivery |
| Part | B Engineering process and team evidence (15 points) |
| Handout wording | "Provide a concise release/history table and two selected Issue/PR chains from different sprints" (3.2); "Selected workflow/history evidence across all three sprints, two reviewed Issue/PR chains, both students' contributions and brief AI-use declaration" (4.1); each chain with "branch, author/reviewer, substantive review, staging integration and release history; preserve IDs and dates" (4.2) |
| Data as of | 2026-11-26, `sprint-3` at `fd9cdd0` (merge of PR #121), `main` at `87be717` (`v0.3.0-rc`) |
| Plan task | P6 in `docs/sprints/sprint-3/final-delivery-plan.md` |
| Repository | https://github.com/Chanat-888/AdviseSlot |

## Version history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-26 | Chanat (drafted with an AI agent) | First draft, before the `v1.0.0-rc` and `v1.0.0` releases. Their rows are TODOs. Section 4 needs both students to confirm their own statement. Awaiting team review. |

Times are Thailand time (ICT, UTC+7). GitHub shows them in UTC. Names: Chanat = Pan (@Chanat-888),
Jeerasak = Snooker (@ShitheadQuin).

## 1. Release and history table

How we work (`docs/workflow.md`): every change is an Issue, a work branch from `sprint-N`, a PR
reviewed and merged by the teammate, then one release PR from `sprint-N` into `main`. The
`sprint-N` branch is where features are integrated before a release. Every release on `main` since
Lab 5 is deployed to Google Cloud Run by the "Deploy demo" workflow (`.github/workflows/deploy.yml`).
Its smoke test checks that `/api/version` returns the released commit.

| Release | Date (merge to `main`) | `main` commit | Release PR (author → reviewer/merger) | Contents | Tests before release | Deploy and evidence |
|---|---|---|---|---|---|---|
| `v0.1.0-sprint-1` | 2026-11-05 18:20 | `6718744` | #32 (Jeerasak → Chanat), Issue #14 | Sprint 1: F-01 to F-09, R-01 to R-04 | `evidence/release-sprint-1-tests.txt`, R-04 restart `evidence/r04-restart.txt` | Local only (D-25). Notes: `docs/sprints/sprint-1/release-notes.md`. Assessed in Deliverable 1 |
| (no tag) Lab 5 release | 2026-11-12 23:27 | `715cfed` | #52 (Chanat → Jeerasak), Issue #45 | Docker image, CI, deploy workflow, version footer (Lab 5). No feature change | CI on #52 | Deploy run 43258951754, revision `adviseslot-00003-tbf`. `docs/labs/lab-05/deployment.md` |
| `v0.1.1-uat` | 2026-11-13 00:37 (tagged 2026-11-19) | `cbcb783` | #57 (Chanat → Jeerasak) | Lab 5 `deployment.md`. Same Sprint 1 code. The version Team Top 2 tested in Lab 6 | CI on #57 | Deploy run 43271430522, revision `adviseslot-00004-ksp`. `docs/labs/lab-06/part-a-uat-handoff.md` |
| (no tag) Lab 6 fix release | 2026-11-20 19:49 | `c4dc3b4` | #65 (Chanat → Jeerasak), after sync PR #64 | Fix for UAT defect #63 / #58 (Logout after a second login, PR #59, TDD red `c50ec5a`, green `51490ea`) | `evidence/lab6-logout-red.txt`, `evidence/lab6-logout-green.txt` | Deploy run 44739029326, revision `adviseslot-00005-4tw`, re-tested by Team Top 2 on 2026-11-22. `docs/labs/lab-06/part-d-resolution-retest.md` |
| `v0.2.0-sprint-2` | 2026-11-23 18:51 | `198a1ea` | #90 (Chanat → Jeerasak) | Sprint 2: F-10 to F-15, Lab 7 BR-07 change (#67, D-31) | `evidence/release-sprint-2-tests.txt`, `evidence/r04-restart-sprint-2.txt` | Deploy run 45168953657, revision `adviseslot-00006-vg4`. Post-deploy check PR #91, `evidence/post-deploy-sprint-2.txt`. Notes: `docs/sprints/sprint-2/release-notes.md` |
| `v0.3.0-rc` | 2026-11-24 13:49 | `87be717` | #105 (Chanat → Jeerasak), Issue #102 | Deliverable 2 release candidate: F-01 to F-16 | `evidence/release-rc-tests.txt`, `evidence/r04-restart-rc.txt` | Deploy run 45343279800, revision `adviseslot-00007-6l4`. Post-deploy check PR #107, `evidence/post-deploy-rc.txt`. Notes: `docs/sprints/sprint-3/release-notes-rc.md`. Assessed in Deliverable 2 |
| `v1.0.0-rc` | **TODO (Jeerasak, plan S6, 4 Dec)** | **TODO** | **TODO** release PR, Issue #118 | Final release candidate: F-01 to F-19 (tested commit `sprint-3` `d12ecfd`) | `evidence/release-v1-rc-tests.txt` (server 377 passed, E2E 13 passed, 0 failed, 0 skipped), `evidence/r04-restart-v1-rc.txt`. Notes PR #119 | **TODO:** deploy run, revision, post-deploy evidence, Team Top 2 UAT re-test record |
| `v1.0.0` | **TODO (Jeerasak, plan S3, 6 Dec)** | **TODO** | **TODO** | Final release: F-01 to F-19, plus any fixes from the `v1.0.0-rc` re-test | **TODO:** final test and CI run (plan S5) | **TODO:** deploy run, revision, post-deploy check, data still there after a redeploy. Notes: `docs/sprints/sprint-3/release-notes.md` |

Tags `v0.1.0-sprint-1` and `v0.3.0-rc` were created by Jeerasak, `v0.1.1-uat` and
`v0.2.0-sprint-2` by Chanat. The repository has tags but no GitHub "Release" pages.

Branch history across the three sprints:

| Sprint | Integration branch | Work merged into it | Release PRs into `main` |
|---|---|---|---|
| Sprint 1 (with Lab 5 and Lab 6) | `sprint-1` | 33 PRs (#1 to #66, including 1 Dependabot PR and 3 sync PRs) | #32, #52, #57, #65 |
| Sprint 2 (with Lab 7 and Deliverable 2) | `sprint-2` | 26 PRs (#76 to #109, including 2 sync PRs) | #90, #105 |
| Sprint 3 (Final Delivery) | `sprint-3` (from `sprint-2`, #111) | 6 PRs so far (#111 to #121) | **TODO:** `v1.0.0-rc`, `v1.0.0` |

## 2. Two Issue → branch → PR → review → merge chains

Chain A is Sprint 2, written by Jeerasak and reviewed by Chanat. Chain B is Sprint 3, written
by Chanat and reviewed by Jeerasak. Both follow the same order: the contract is reviewed and
merged first, then the failing tests, then the code, then the teammate's review and merge.

### Chain A: Sprint 2, F-13 Delete slot (Jeerasak → Chanat)

| Step | ID | Who | When | What |
|---|---|---|---|---|
| Requirement | FR-13, BR-13, BR-14, D-29 | | | `docs/sprints/sprint-2/F-13-delete-slot.md`, `docs/srs.md` |
| Contract Issue | #68 | Chanat and Jeerasak | | Sprint 2 contracts |
| Contract PR | #77, branch `docs/sprint-2-contracts-slots` | Author Jeerasak, reviewer Chanat | Opened 2026-11-22 22:27, merged by Chanat 23:56 (`3493229`) | Contracts F-12, F-13, F-15. Chanat ran the README steps and left 7 inline points (for example, the F-12 self-overlap case could not catch a missing `id ≠ this id` check, and the F-15 message for a 23P01 race). Jeerasak answered every thread and fixed them in `3546711`, then Chanat approved |
| Implementation Issue | #73 | Opened by Chanat, assigned to Jeerasak | 2026-11-22 22:13, closed 2026-11-23 14:03 | "F-13 Delete slot: implementation" |
| Branch | `feat/f13-delete-slot` | Jeerasak | from `sprint-2` `078e3e6` | |
| TDD red | `7213584` (test commit) | Jeerasak | 2026-11-23 12:42 | `cd server && npx vitest run tests/slots.delete.test.ts` on `078e3e6`: TEST-F13-01 to -07, 7 failed of 7 (no `DELETE /api/slots/:id` yet). `evidence/f13-red.txt` |
| TDD green | `104dadc` | Jeerasak | 2026-11-23 12:47 | Soft delete, slot row lock in booking. Full server suite 187 passed, 0 failed. `evidence/f13-green.txt` |
| UI and E2E | `9b0328a`, `d920918` | Jeerasak | 2026-11-23 12:49 | Delete button with inline confirm, TEST-F13-08 E2E, 7 passed (`evidence/f13-e2e.txt`). Contract v0.3: two forced-order race cases found during the work |
| Update from `sprint-2` | `3229bca` | Jeerasak | 2026-11-23 13:16 | Merged `sprint-2` (with Lab 7 #82). Resolved one conflict in `createBooking`. 194 passed, E2E 7/7. `evidence/f13-merge-sprint-2.txt` |
| PR | #81 | Author Jeerasak, reviewer Chanat | Opened 2026-11-23 12:50 | CI `test-and-docker` passed (run 45123063212) |
| Review | #81 | Chanat | 2026-11-23 14:00, approved | Ran `3229bca`: server 194/194, builds OK, E2E 7/7. Checked each status code against the F-13 contract. Two non-blocking inline points: the duplicated id rule in two routers, and a `sleep(400)` that can only weaken the race check. Jeerasak replied to both. The shared `parseId` was then added in F-12 (#87, `ea1b8fb`) |
| Merge into `sprint-2` | `2e75ebe` | Merged by Chanat (reviewer) | 2026-11-23 14:02 | |
| Release | #90 → `v0.2.0-sprint-2` = `198a1ea` | Chanat → Jeerasak | 2026-11-23 18:51 | `2e75ebe` is in `v0.2.0-sprint-2` (`git merge-base --is-ancestor 2e75ebe v0.2.0-sprint-2`) |
| Deploy | run 45168953657, revision `adviseslot-00006-vg4` | CI | 2026-11-23 | Post-deploy check #91, `evidence/post-deploy-sprint-2.txt` |

### Chain B: Sprint 3, F-18 Cancellation history (Chanat → Jeerasak)

| Step | ID | Who | When | What |
|---|---|---|---|---|
| Requirement | FR-18, BR-09, NFR-03, D-32 | | | `docs/sprints/sprint-3/F-18-cancellation-history.md` |
| Contract Issue | #92 | Chanat | | Sprint 3 contracts F-18, F-19 |
| Contract PR | #93, branch `docs/sprint-3-contracts-f18-f19` | Author Chanat, reviewer Jeerasak | Opened 2026-11-23 19:43, merged by Jeerasak 19:58 (`4213372`) | Jeerasak checked both contracts against SRS v0.5, the SDS and the Sprint 2 code. He found that the F-19 E2E step depended on the time of day. Chanat fixed it in `696809e` (the E2E setup now inserts the late slot and its notification), then Jeerasak approved |
| Plan | #109 (P1) | Chanat → Jeerasak | merged 2026-11-26 | Final Delivery plan gives F-18 to Chanat |
| Branch | `feat/f18-cancellation-history` | Chanat | from `sprint-3` `80a2d5a` (after CI on `sprint-3`, #111) | |
| TDD red | `87214ee` | Chanat | 2026-11-26 15:09 | `cd server && npm test`: 6 failed, 334 passed (340). TEST-F18-02 to -05, the tie-order case and the R-01 route inventory fail because there is no `/history` route. `evidence/f18-red.txt` |
| TDD green | `eda368d` | Chanat | 2026-11-26 15:12 | `GET /api/bookings/history` (advisors only): 340 passed, 0 failed, server build OK. `evidence/f18-green.txt` |
| E2E red, then green | `e38ffdc`, then `da3f1a5` | Chanat | 2026-11-26 15:15 | TEST-F18-06 added before the UI: 1 failed, 10 passed (`evidence/f18-e2e-red.txt`). After the UI: 11 passed (`evidence/f18-e2e.txt`) |
| Contract update | `4757b9b` | Chanat | 2026-11-26 | F-18 contract v0.3 (status, red-run note), README E2E step |
| Implementation Issue | #112 | Opened by and assigned to Chanat | 2026-11-26 15:19, closed 16:00 | "F-18 Cancellation history (Sprint 3): implementation". It was opened after the work started, right before the PR. The work itself was planned in #109 |
| PR | #113 | Author Chanat, reviewer Jeerasak | Opened 2026-11-26 15:19 | CI `test-and-docker` passed (run 45785927847) |
| Review | #113 | Jeerasak | 2026-11-26 15:34 | Read the diff against the contract and #112. Two inline points. (1) No test covered the "Cancelled by <student name>" text. (2) The query reads every booking and drops the Upcoming ones in code, so please record that. Chanat replied to both. Fixed in `aa72d73`: the E2E step now checks Advisor Two's History, and contract section 9 has the note |
| Approval | #113 | Jeerasak | 2026-11-26 16:00 | Ran it locally: Vitest 340/340 and the server build on `4757b9b` (no server change after it), Playwright 11/11 on `aa72d73` |
| Merge into `sprint-3` | `7cd8487` | Merged by Jeerasak (reviewer) | 2026-11-26 16:00 | Push CI on `7cd8487` passed (run 45788003105) |
| Integration | `sprint-3` `d12ecfd` | | 2026-11-26 | Tested together with F-17 and F-19 for `v1.0.0-rc`: server 377 passed, E2E 13 passed. CI run 45802912186, `evidence/release-v1-rc-tests.txt`, notes PR #119 |
| Release | **TODO** `v1.0.0-rc`, then `v1.0.0` | Jeerasak (plan S6, S3) | **TODO** | **TODO:** release PR, `main` commit, tag, deploy run, revision, post-deploy check |

## 3. Contribution table

### 3.1 How we counted

All counts come from GitHub with `gh` on 2026-11-26, before the `v1.0.0-rc` and `v1.0.0`
releases.

- **PRs:** `gh pr list --state all --limit 200 --json number,author,baseRefName,headRefName,mergedBy,reviews`.
  The repository has 72 PRs: 71 merged, 1 closed without merging (#40, a demo that a failing
  check blocks a merge), 0 open. Each PR is counted once, by its author. "Release" means a PR
  into `main`. "Sync" means a PR that only merges one branch into another (#48, #56, #64, #97,
  #106). Everything else is "work". The sprint is the PR's base branch.
- **Reviews:** a merged PR counts as reviewed by a person if that person left at least one review
  on it and is not its author. Inline comments come from `gh api repos/Chanat-888/AdviseSlot/pulls/comments`.
  Comments on the teammate's PR and replies on your own PR are counted apart.
- **Issues:** `gh issue list --state all --json author,assignees`. 49 Issues. 4 are assigned to
  both of us (#15, #54, #67, #68).
- **Commits:** `git log --no-merges origin/main origin/sprint-3`, by author name. Merge commits
  are left out because they only record who pressed Merge, and that is already counted from
  the PR data. The commit count measures only how often each of us commits, not how much work
  each of us did. Counting lines changed would double-count release and sync PRs, so we did not
  count lines.

### 3.2 Counts

| Measure | Chanat (@Chanat-888) | Jeerasak (@ShitheadQuin) |
|---|---|---|
| Work PRs authored, Sprint 1 / 2 / 3 | 19 / 14 / 3 = 36 | 10 / 10 / 3 = 23 |
| Release PRs authored | 5 (#52, #57, #65, #90, #105) | 1 (#32) |
| Sync PRs authored | 4 (#56, #64, #97, #106) | 1 (#48) |
| Teammate's PRs reviewed | 25 of 25 | 45 of 45 (plus Dependabot #53) |
| "Changes requested" reviews | 4 (#21, #43, #100, #101) | 4 (#28, #38, #55, #61) |
| Inline review comments on the teammate's PRs | 12 | 37 |
| Inline replies on own PRs | 22 | 9 |
| PRs merged | 24 (all of them Jeerasak's) | 47 (45 of Chanat's, Dependabot #53, and his own #94 after Chanat's approval) |
| Issues assigned (4 of them shared) | 29 | 23 |
| Issues opened | 38 | 10 (and 1, #63, by the Lab 6 partner team) |
| Non-merge commits on `main` and `sprint-3` | 102 | 68 |
| Tags created | `v0.1.1-uat`, `v0.2.0-sprint-2` | `v0.1.0-sprint-1`, `v0.3.0-rc` |

### 3.3 What each of us did

| Student | Contribution (PR numbers) |
|---|---|
| Chanat Dachkhumhang, 67070503409, @Chanat-888 | **Specs:** baseline decisions, SRS and System SDS (#1), feature list and traceability (#2), Sprint 1 plan and contracts F-01 to F-03 (#18), team workflow (#19), Sprint 2 contracts F-10, F-11, F-14 (#76), Lab 7 BR-07 contract (#80), Sprint 2 DoD (#83), Sprint 3 contracts F-18, F-19 (#93), Final Delivery plan (#109), final SRS, features, SDS, F-16 to F-19 contracts and `v1.0.0` notes draft (#121). **Code, test-first:** F-01 (#22), F-02/F-03 (#23), F-06/F-07 (#26), Playwright E2E (#24, #28), F-10 (#84), F-11 (#86), F-14 (#88), Lab 7 BR-07 change (#82), F-18 (#113), F-19 with the Notification table (#117). **Lab 5/6:** cloud-ready config (#34), CI (#38), deploy workflow (#46), version footer (#51), deployment doc (#55), Lab 6 UAT docs and results (#61, #62, #66), fix for UAT defect #63 (#59). **Releases:** release PRs #52, #57, #65, #90, #105, sync PRs, release evidence (#30, #89, #91, #103). Built the Deliverable 1 and 2 PDFs. Reviewed and merged all of Jeerasak's PRs except #94 |
| Jeerasak Phisawong, 67070503461, @ShitheadQuin | **Specs:** contracts F-04 to F-09 (#21), F-12, F-13, F-15 with SDS v0.7 and D-28 to D-30 (#77), F-16 (#94), F-17 with D-33 (#100). **Code, test-first:** project skeleton (#3), seed data (#20), F-04/F-05 (#25), F-08/F-09 with the full E2E journey (#27), R-01 to R-04 checks (#29), F-13 (#81), F-15 (#85), F-12 with the shared `parseId` (#87), F-16 (#98), F-17 (#115). **Lab 5/7:** Dockerfile (#36), first GCP deploy and Workload Identity Federation (#43, #47, #48), Lab 7 metrics (#101), CI on every push (#104), CI on `sprint-3` (#111). **Releases:** Sprint 1 release prep and release PR (#31, #32), `v0.1.0-sprint-1` and `v0.3.0-rc` tags, post-deploy check of the release candidate on the live site (#107), `v1.0.0-rc` notes and RC evidence (#119). Reviewed and merged all of Chanat's PRs, with the R5 fresh-clone check on the release PRs (#90, #105) |

**TODO (both, after 6 Dec):** run the counts again after the `v1.0.0` release and add plan
tasks S3 to S9 and P4, P7.

## 4. AI-use declaration

**TODO (Chanat and Jeerasak): each of you read and confirm or correct your own paragraph. This
is a statement in your name.** The wording follows the Deliverable 2 declaration (section E.10)
and covers the whole project.

Facts that are in the repository: `docs/workflow.md` ("AI agents") says agents may draft code,
docs and reviews, the person who commits is responsible for it, agents do not merge PRs, and
agents do not post to GitHub until the person has read the text. Every version-history row that an
agent drafted says "(drafted with an AI agent)". The Product DoD (`docs/sprints/sprint-1/definition-of-done.md`)
counts only test output, commit IDs, PR links and screenshots as evidence. An AI agent's
statement does not count.

**Chanat. CONFIRM (Chanat).** I used Claude Code (Anthropic's AI coding agent, model Claude Opus
5.5, with Claude Sonnet 5.5 for some delegated sessions) in all three sprints. It drafted
contracts, tests, code, evidence files, release notes, PR descriptions and review comments. It ran
the test, restart and post-deploy checks, ran the local dry-run of our Lab 6 UAT cases, and wrote
the build scripts for the Deliverable 1 and Deliverable 2 PDFs. I decided what to build and
in what order. I read each draft and asked for changes where it was wrong or unclear. I gave the
go-ahead for every commit, push, PR and GitHub comment, and the agent showed me each text before
posting it. The agent never merged a PR. In Lab 6 it did not enter passwords on the deployed site
and was not a UAT tester. The output of the checks it ran is saved in `evidence/` or shown in this PDF. I am
responsible for everything I committed or posted.

**Jeerasak. CONFIRM (Jeerasak).** I used an AI agent (Claude Code, model Claude Opus 5.5) to
draft contracts, tests, code, PR descriptions and review comments, and to collect the GitHub data
for the Lab 7 metrics. I chose what to build and in what order. I read every change, and I ran the
server tests, builds and the E2E journey locally before opening or approving a PR. I decided what
was posted. The agent never merged a PR. It showed me each PR description and review before
posting. One Issue comment (#75) was posted before I had read its exact text. Version-history rows
drafted with the agent say so. **TODO (Jeerasak):** add anything for Sprint 3 (F-17, `v1.0.0-rc`,
`v1.0.0` release) that differs from this.

How we checked AI output:

- Every PR was reviewed by the other student. Reviews name the commit that was run and the test
  counts (for example, chains A and B in section 2).
- New behavior starts with a failing test that is saved in `evidence/` before the code, so a test
  written by an agent is shown to fail before it is trusted.
- CI (`test-and-docker`) runs on every PR and push. The deploy smoke test checks the running commit.
- The Lab 6 UAT was done by people from another team (Team Top 2), not by an agent. The `v1.0.0-rc` re-test is done by testers from another team (Team Top 2 in Lab 6); their names are added after the re-test.
