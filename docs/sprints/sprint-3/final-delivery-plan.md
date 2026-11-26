# Final Delivery plan (Sprint 3)

Who does what for the CPE 334 Final Project Delivery. Source: handout
`project_final_delivery_v1.pdf` (100 points, 10% of the grade).
**Due 13 Dec 2026, 23:59** on LEB2 (CPE 334 section 131, group EN-017_P1).

AI agents: read this file, then work only on the rows assigned to your person.
Follow `docs/workflow.md` for every change (Issue, branch from `sprint-3`, PR,
teammate review, reviewer merges).

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-26 | Chanat (drafted with an AI agent) | First split of the remaining work. |
| 0.2 | 2026-11-26 | Chanat (drafted with an AI agent) | Review of PR #109: D2 and Lab 7 row (B0), NFR-10 seed-and-clean script in S4, P4 says FR-17 to FR-19 and NFR-10, UAT re-test on a release candidate before the 6 Dec release. |

## 1. Where we are (26 Nov 2026)

- `main` = `87be717`, tag `v0.3.0-rc`: Sprint 1 and 2 features (F-01 to F-15) and F-16.
- `sprint-2` has one more merge (#107, RC post-deploy evidence). There is no `sprint-3` branch yet.
- F-17, F-18 and F-19 have reviewed contracts in `docs/sprints/sprint-3/` but **no code yet**.
- No open Issues or PRs. Nothing submitted on LEB2.
- Pan is travelling and works remotely. Snooker is on site.

## 2. What the handout wants

| Part | Points | Content |
|---|---|---|
| A Final working product | 35 | All of F-01 to F-19 working on the deployed final version; completion table; demos of saved data, a rule rejection and a backend 403. |
| B Process and team evidence | 15 | Release/history table, two Issue/PR chains from different sprints, contribution table, AI-use declaration. |
| C Requirements and traceability | 20 | Final SRS, feature list, System-Level SDS, all contracts with AC/STS, and a requirement-to-verification matrix with PASS/FAIL and commit for every FR, BR and important NFR. |
| D Final QA and Definition of Done | 20 | Test/CI output on the final commit, two test excerpts (one rule, one access), TDD red/green, independent UAT re-test, defect/debt register, DoD review, deploy + restart check, setup summary. |
| E Demo video | 10 | At most 4 minutes, YouTube unlisted (anyone with the link can view). **Both of us on camera together**, not a video call. Final version, major journeys, a saved result, a rule rejection. |

One self-contained PDF (appendices inside it). The cover lists both names and IDs, the theme, the repo URL,
the submitted tag/commit, the deployed URL and version, and a navigation table (part → pages).

## 3. Who does what

### Snooker (@ShitheadQuin)

| # | Task | Output | Target date |
|---|---|---|---|
| S1 | Create `sprint-3` from `sprint-2` (and CI on it, like #67) | branch | 27 Nov |
| S2 | F-17 Appointment summary: Issue, TDD (TEST-F17-xx red, then green), E2E step, PR | code + `evidence/` | 2 Dec |
| S6 | Deploy a release candidate (`v1.0.0-rc`) from `sprint-3`, then UAT re-test with Team Top 2 on it (Lab 6 cases + Sprint 2/3 journeys): tester, expected/actual, version. Re-test any fix on the release. | UAT re-test record | RC 4 Dec, UAT 4–5 Dec |
| S3 | Release: PR `sprint-3` → `main`, tag `v1.0.0`, deploy through CI, post-deploy checks, data still there after a redeploy | release evidence doc | 6 Dec |
| S4 | NFR-10 on the deployed final version (SRS target: p95 under 500 ms over 50 requests with 1,000 slots). A script inserts 1,000 slots with a marker, runs the 50 requests, saves the output, then deletes only the marked rows, so real data and demo accounts are untouched. | script + measurement in traceability | 7 Dec |
| S5 | Final CI/test run on the final commit: passed, failed and skipped counts | CI output for Part D | 7 Dec |
| S7 | Defect and tech-debt register; Product DoD review | doc for Part D | 10 Dec |
| S8 | Part A program demos: captioned screenshots with feature/AC IDs, saved data shown again, a rule rejection, backend 403 for a wrong role or someone else's record (API output, not only UI) | screenshots + captions | 10 Dec |
| S9 | README and setup summary current (Docker, env names, migrate/seed, test, deploy) | README + Part D section | 10 Dec |

### Pan (@Chanat-888)

| # | Task | Output | Target date |
|---|---|---|---|
| P1 | F-18 Cancellation history: Issue, TDD (TEST-F18-xx red, then green), E2E step, PR | code + `evidence/` | 1 Dec |
| P2 | F-19 Late-slot notification (new Notification table + migration): Issue, TDD, E2E step, PR | code + `evidence/` | 4 Dec |
| P3 | Final SRS, `features.md`, System-Level SDS and F-16 to F-19 contracts match what was released | docs | 9 Dec |
| P4 | `traceability.md` final: every FR/BR/NFR with test ID, PASS/FAIL/SKIPPED and final commit (FR-17 to FR-19 and NFR-10 are still "Allocated"; FR-16 is already Verified) | matrix for Part C | 9 Dec |
| P5 | Release notes `v1.0.0` | doc | 8 Dec |
| P6 | Part B: release/history table, two Issue/PR chains from different sprints, contribution table, AI-use declaration | Part B section | 10 Dec |
| P7 | Assemble the final PDF: cover, navigation table, Parts A–E, appendices | PDF | 11 Dec |

### Both

| # | Task | Target date |
|---|---|---|
| B0 | **Deliverable 2 and Lab 7 (due 29 Nov, 23:59) come first.** D2 PDF draft is built (`deliverable-2.pdf`, 25 Nov). Both check it, then submit both on LEB2 and check that LEB2 shows the files. | 29 Nov |
| B1 | Review and merge each other's PRs (reviewer merges) | as they come |
| B2 | Record the demo video together, upload as unlisted on YouTube, add link + timestamps to Part E | by 11 Dec |
| B3 | Read the whole PDF against the handout checklist (section 5) | 12 Dec |
| B4 | Submit the PDF on LEB2 (one submission for the group), then check that LEB2 shows the file | by 13 Dec 23:59 |

## 4. Timeline

| Date | Milestone |
|---|---|
| 29 Nov | D2 and Lab 7 submitted. Sprint 3 progress check: `sprint-3` exists, Issues open for F-17 to F-19, work started |
| 4 Dec | F-17, F-18, F-19 merged into `sprint-3`, all tests and E2E green; `v1.0.0-rc` deployed |
| 4–5 Dec | UAT re-test with Team Top 2 on the RC; fixes |
| 6 Dec | Release `v1.0.0` on `main`, deployed |
| 7 Dec | NFR-10 measured, final CI run |
| 9–11 Dec | Docs final, PDF assembled, video recorded |
| 12 Dec | Final read-through |
| 13 Dec 23:59 | Submitted on LEB2 |

## 5. Open questions

- **Video:** both of us must be on camera together. Pan is travelling: agree a date when we are in the same place, before 11 Dec if possible.
- **Video length:** the handout says "at most 10 minutes" in section 2 and "maximum 4 minutes" in Part E. Aim for 4 minutes.
- If F-19 is late, Snooker can take it after F-17; record the swap here.
- If Pan's docs finish early, Pan takes S9 (README/setup) from Snooker.
