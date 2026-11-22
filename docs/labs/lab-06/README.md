# Lab 6: independent UAT and defect management

Sprint 1 UAT for AdviseSlot. Due 22 Nov 2026. These files are the source for the team PDF
(one PDF per team, handout section 4). Status markers: _TBD_ = not done yet.

| Item | Value |
|---|---|
| Product Team (us) | Duo Gang: Chanat Dachkhumhang (67070503409, @Chanat-888), Jeerasak Phisawong (67070503461, @ShitheadQuin) |
| UAT Team (tests our app) | Team Top 2: Grittapob Chutitas (67070503402), Moe Thauk Ko (67070503483) |
| Team we test (Part B) | Team Top 2 (same students): Inventory and Borrowing System, https://inventory-ftuxc6vyna-as.a.run.app |
| Theme | 1 Appointment & Scheduling: student office-hour advising |
| Repository | https://github.com/Chanat-888/AdviseSlot |
| Sprint 1 scope | F-01 to F-09 (`docs/sprints/sprint-1/`) |
| Deployed URL | https://adviseslot-nfnam6jppq-as.a.run.app |
| Final UAT decision | Accepted by Team Top 2 on 2026-11-22 for `c4dc3b4` (Part D section 5) |

## Files

| Part | Points | File |
|---|---|---|
| A UAT preparation and handoff | 20 | [part-a-uat-handoff.md](part-a-uat-handoff.md) |
| B Independent execution (we test the partner) | 25 | [part-b-uat-execution.md](part-b-uat-execution.md) |
| C Defect reporting and triage | 20 | [part-c-defects-triage.md](part-c-defects-triage.md) |
| D Resolution and independent retest | 35 | [part-d-resolution-retest.md](part-d-resolution-retest.md) |

## Version table

| Role | Ref | Commit | Notes |
|---|---|---|---|
| Sprint 1 baseline | tag `v0.1.0-sprint-1` | `6718744` | Sprint 1 release |
| Tested release (UAT round 1) | `main`, tag `v0.1.1-uat` | `cbcb783` | Lab 5 release; only deployment changes since the baseline. Deployed revision `adviseslot-00004-ksp` |
| Defective code | `client/src/App.tsx` TopBar | `cbcb783` (same code on `sprint-1` `280bbf9`) | Issue #58 |
| Test change (RED) | `fix/logout-busy` | `c50ec5a` | New E2E test |
| Fix (GREEN) | `fix/logout-busy` | `51490ea` (+ `71e41ed` review fixes) | PR #59, merged into `sprint-1` as `0eb6a52` |
| Corrected main release | `main` | `c4dc3b4` | Release PR #65 (after sync PR #64), merged 2026-11-20 by @ShitheadQuin |
| Corrected deployed revision | `adviseslot-00005-4tw` | `c4dc3b4` | Deploy run 44739029326, 100% traffic from 2026-11-20 19:54 ICT; `/api/version` shows `c4dc3b4...` |

Merge commits: `main` and `sprint-1` differ only by merge commits (sync PR #56 and the release
PRs); the application code at `cbcb783` and `280bbf9` is the same for Sprint 1.

## Schedule

| Session | Date | Status |
|---|---|---|
| Product Team dry-run of our own cases (not UAT) | 2026-11-18 | Done |
| Handoff to UAT Team | _TBD_ | |
| UAT round 1 on `cbcb783` | 2026-11-20 | Team Top 2 filed #63 (duplicate of #58); full case results not received yet |
| Fix, review, release, deploy | 2026-11-19 to 20 | Done: PR #59 → `sprint-1`; release PR #65 → `main` `c4dc3b4`; deployed `adviseslot-00005-4tw` |
| UAT retest on corrected release | 2026-11-22 | Team Top 2: #63 PASS on `c4dc3b4`; #63 closed. Sprint 1 decision: Accepted (Discord, 11:01). UAT-01 re-run results not received |
| PDF submitted on LEB2 | by 22 Nov 23:59 | |

## Contributions

| Work | Pan | Snooker |
|---|---|---|
| Part A cases and handoff | Wrote | Reviews |
| Part B execution of partner cases | Both (pair) | Both (pair) |
| Part C reports and triage | _TBD_ | _TBD_ |
| Part D: Issue #58, RED test, fix, PR #59 | Author | Reviewer, merges |
| Release to `main` and deploy | _TBD_ | _TBD_ |
| PDF | _TBD_ | _TBD_ |

## AI use

Pan used Claude Code (an AI agent) to draft the Part A cases, run a local dry-run of them,
find the cause of the Logout defect, write the RED test and the fix, and draft these documents.
Pan read and checked everything before committing or posting. The AI did not merge, did not
enter passwords on the deployed site, and is not a UAT tester.

## Known limitations

- Time-dependent rules (2-hour session expiry, 18:00 / 2 h booking deadlines, 10 concurrent
  bookings) are not in the manual cases; automated tests at the release commit cover them.
- Sprint 1 has no cancel feature, so the Product Team resets UAT data in the database.
