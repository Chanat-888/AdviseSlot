# Part B: independent execution of the partner team's Sprint 1 UAT cases

Here we are the **UAT Team** for the other team's product. These are our results, not theirs.
Status: round 1 done on 2026-11-20 (all five cases PASS, two Minor defects reported). The
partner had not answered the reports by 2026-11-22, so we accepted both as documented minor
limitations (section 6).

## 1. Product under test

| Item | Value |
|---|---|
| Product Team | Team Top 2: Grittapob Chutitas (67070503402), Moe Thauk Ko (67070503483) |
| Application / theme | Inventory and Borrowing System (borrowers request tagged lab assets, a custodian approves them as checkouts) |
| Repository | https://github.com/Ryugc/Inventory-and-Borrowing-System |
| Sprint 1 release tag / commit | `13a8d949e8961fe25d37b5ff6e7b8030fb094431` (from their handoff). Their `main` at test time was `e70fa20`, which differs from `13a8d94` only by the handoff document |
| Deployed URL and revision | https://inventory-ftuxc6vyna-as.a.run.app, revision `inventory-00006-hxv` |
| How we confirmed the version | The site shows no version (`/api/version` returns 404; `/api/health` returns only `{"status":"ok"}`), so we used the commit and revision stated in their handoff. We could not check the deployed commit ourselves |
| Their handoff document | https://github.com/Ryugc/Inventory-and-Borrowing-System/blob/main/docs/labs/lab06/uat-handoff.md |

## 2. Testers

| Name | ID | Team | Role in the run |
|---|---|---|---|
| Chanat Dachkhumhang | 67070503409 | Duo Gang (UAT Team) | Custodian steps |
| Jeerasak Phisawong | 67070503461 | Duo Gang (UAT Team) | Borrower, borrower2 and API steps |

Both students took part. Cases were run in the order the handoff gives (UAT-05, 01, 02, 03, 04)
because later cases use data the earlier ones create. Accounts and passwords came from the
Product Team privately; no password or token appears in the evidence.

## 3. Results

Rules: run every agreed case; write the actual result in our own words, never a copy of the
expected result; BLOCKED is not a pass, so give the reason. All tests are manual (browser, plus
`curl` for the API steps the handoff asks for). Date 2026-11-20, times ICT.

| Case | Category | Tester | Time | Tested version | Inputs used | Actual result | PASS / FAIL / BLOCKED | Evidence ID |
|---|---|---|---|---|---|---|---|---|
| UAT-05 | Invalid / unauthenticated access | Jeerasak | 16:18-16:21 | `13a8d94` / `inventory-00006-hxv` | borrower@ku.ac.th with `invalid-test-password`; `GET /api/assets` with no token | Wrong password: red banner "HTTP 401 Error: Invalid credentials" and no session. The API call returned `401 {"error":"Unauthorized"}` with no asset data. | PASS | B-01, B-02 |
| UAT-01 | Normal journey | Jeerasak (steps 1-3), Chanat (steps 4-6) | 16:23-~16:29 | same | borrower, custodian; TAG-RPI-001; due date left as the UI gave it (04/12/2026) | Borrower requested the Raspberry Pi; the toast gave request `7f712a92-...`; My requests showed PENDING. Custodian saw that request in the queue, Approve / Checkout filled in the ID, Checkout said "Checkout completed.", the queue emptied and loan `53cd6509-...` appeared. Catalog then showed RPI CHECKED_OUT, DSO and SNS AVAILABLE. | PASS (defects #36, #37 seen) | B-03 to B-05, B-21 to B-24 |
| UAT-02 | Business rule (unavailable asset) | Jeerasak | 16:35-16:48 | same | borrower token; TAG-RPI-001 id `9a94358f-...` | Catalog showed RPI CHECKED_OUT with its Request button disabled. `POST /api/borrow-requests` for that asset returned `409 {"error":"Asset is unavailable"}`. The borrower's list was the same before and after (one APPROVED request), and the catalog did not change. | PASS | B-06 to B-09, B-15 |
| UAT-03 | Forbidden role / ownership | Jeerasak | 16:46-16:54 | same | borrower2 creates a request for TAG-SNS-001 (`a0337e79-...`); borrower token | borrower2's request was PENDING. The borrower's My requests and `GET /api/borrow-requests/my` listed only the borrower's own request. The borrower's `POST /api/borrow-requests/a0337e79-.../checkout` returned `403 {"error":"Forbidden"}`. Back as borrower2, the request was still PENDING and the Sensor Kit still AVAILABLE. | PASS | B-10 to B-17 |
| UAT-04 | State / persistence | Jeerasak (steps 1-3), Chanat (step 4) | 17:04-17:12 | same | UAT-01 request `7f712a92-...`; borrower, custodian | The borrower's request stayed APPROVED before and after sign out, hard refresh (Ctrl+Shift+R) and sign in; the catalog still showed RPI CHECKED_OUT and DSO AVAILABLE. After a new custodian sign-in (17:10) loan `53cd6509-...` was still listed and borrower2's request still pending; the catalog (17:12) matched. | PASS | B-18 to B-20, B-25, B-26 |

No case FAILED or was BLOCKED.

## 4. Evidence

Screenshots and terminal captures, kept in the team folder and attached to the PDF. B-01 to B-20
are Jeerasak's, B-21 to B-26 are Chanat's.

| Evidence ID | Case / step | Action | Expected | Actual | Time | Version |
|---|---|---|---|---|---|---|
| B-01 | UAT-05 step 1 | Sign in with a wrong password | 401, no session | Banner "HTTP 401 Error: Invalid credentials", still on Sign in | ~16:18 | `13a8d94` |
| B-02 | UAT-05 step 2 | `GET /api/assets` without token | 401, no data | `HTTP/1.1 401 Unauthorized`, `{"error":"Unauthorized"}` | 16:20:56 | `13a8d94` |
| B-03 to B-05 | UAT-01 steps 2-3 | Borrower catalog, Request, My requests | Request created, PENDING | Toast "Request created: 7f712a92-..."; My requests PENDING (row shows the asset UUID, #36) | 16:24 | `13a8d94` |
| B-08, B-15 | UAT-02 steps 2-3 | Request a CHECKED_OUT asset by API | 409 "Asset is unavailable", no new request | `HTTP/1.1 409 Conflict`, `{"error":"Asset is unavailable"}`; `/my` unchanged | 16:42:52, 16:48:09 | `13a8d94` |
| B-14, B-15 | UAT-03 steps 2-4 | Borrower reads own list and checks out borrower2's request | Other request hidden; 403 | Only own request listed; `HTTP/1.1 403 Forbidden`, `{"error":"Forbidden"}` | 16:47:40, 16:48:09 | `13a8d94` |
| B-16, B-17 | UAT-03 step 5 | borrower2 rechecks after the denied attempt | Request PENDING, asset AVAILABLE | Unchanged | 16:54:18 | `13a8d94` |
| B-21 to B-24 | UAT-01 steps 4-6 | Custodian approves and checks out | Queue empties, loan appears, RPI CHECKED_OUT | As expected (loan card title is the asset UUID, #36; form labels swapped, #37) | ~16:26-16:29 | `13a8d94` |
| B-25, B-26 | UAT-04 step 4 | Custodian signs in again | Loan still there; catalog consistent | Loan `53cd6509-...` listed; RPI CHECKED_OUT, DSO and SNS AVAILABLE | 17:10, 17:12 | `13a8d94` |

The negative cases show both the rejection (401, 409, 403) and that the protected data did not
change (B-09, B-15 after-list, B-16, B-17).

## 5. Findings sent to the partner

Every FAIL becomes an Issue on the partner's repository (full report in Part C section 1). No
case failed; we still reported two defects we saw while running the cases.

| Our ref | Case | Partner Issue | Severity | Sent on | Partner response |
|---|---|---|---|---|---|
| F-1 | UAT-01, UAT-04 | [#36](https://github.com/Ryugc/Inventory-and-Borrowing-System/issues/36) asset UUID shown instead of the asset name | Minor | 2026-11-20 | None by 2026-11-22; Issue open |
| F-2 | UAT-01, UAT-04 | [#37](https://github.com/Ryugc/Inventory-and-Borrowing-System/issues/37) checkout form labels look swapped | Minor | 2026-11-20 | None by 2026-11-22; Issue open |

Observation, not reported as a defect: a disabled Request button looks the same as an enabled
one (B-06); clicking it does nothing.

## 6. Retest of the partner's fixes and our acceptance decision for their product

| Partner Issue | Corrected version | Tester | Date | Actual result | PASS / FAIL | Evidence ID |
|---|---|---|---|---|---|---|
| #36 | No fix released by 2026-11-22 | n/a | n/a | Not retested: no corrected version | n/a | n/a |
| #37 | No fix released by 2026-11-22 | n/a | n/a | Not retested: no corrected version | n/a | n/a |

**Our decision on their Sprint 1 release: Accepted with documented minor limitations.**
Version `13a8d94` (revision `inventory-00006-hxv`), date 2026-11-22, testers: Chanat
Dachkhumhang, Jeerasak Phisawong.

Reasons: all five agreed cases passed, including the normal journey, the unavailable-asset rule
(409), the forbidden checkout and ownership checks (403, other borrower's request hidden) and
persistence across sessions. No Critical or Major defect was found and no case was BLOCKED. The
two open defects are Minor and do not stop any user task:

| Accepted limitation | Partner Issue | Effect |
|---|---|---|
| My requests and Active loans show the asset UUID instead of the asset name | #36 | Users must match the UUID to an asset; the request ID is shown only in the toast |
| Checkout form labels look swapped | #37 | Only matters when a custodian types an ID by hand; Approve / Checkout fills the form correctly |

Limit of this decision: we could not confirm the deployed commit from the site (section 1).

Recorded as a comment on #36 and #37 on 2026-11-22, and both Issues left open for a later sprint.
