# Part C: defect reporting and triage

Severity scale (by user impact):

- **Critical**: data loss, security or privacy breach, or the main journey cannot be done.
- **Major**: a Sprint 1 feature fails in normal use; a workaround exists but users cannot be
  expected to know it.
- **Minor**: wrong or unclear behaviour that does not stop the user.

Critical and Major block Sprint 1 acceptance. Minor must be fixed or accepted by the UAT Team as
a documented known limitation. A request for behaviour outside the agreed Sprint 1 contract is
an enhancement, not a defect; a failing Sprint 1 requirement is never relabelled as one.

## 1. Outgoing reports (we, as UAT Team, report on the partner's product)

_None yet; Part B not started._ Each report records: Issue ID, product team, reporter, tested
version, linked case/requirement, preconditions/data, steps, expected, actual, severity with
reason, evidence ID, how the partner was notified and the outcome.

## 2. Findings about our product found before the handoff

Found by the Product Team (Pan, with an AI agent) in the dry-run of our own cases on
2026-11-18. This is **not** an independent UAT finding; we disclose it to the UAT Team in the
handoff and fix it through the normal process (Part D).

### Issue #58: Logout button stays disabled after logging in again in the same tab

| Field | Value |
|---|---|
| Issue | https://github.com/Chanat-888/AdviseSlot/issues/58 (label `bug`) |
| Product team / owner | Duo Gang / Chanat Dachkhumhang |
| Reporter | Chanat Dachkhumhang (Product Team dry-run) |
| Tested version | `cbcb783` (deployed Lab 5 release), run locally on a fresh seeded database. Same code on `sprint-1` `280bbf9` |
| Linked case / requirement | UAT-01 step 7; FR-02; F-02 section 2 steps 1 and 6 (a logged-in user clicks Logout in the top bar, the client goes to `/login`); SDS 4.1 (Logout in the top bar). AC-F02-01 is API-level and passes; the failure is in the client. |
| Preconditions / data | Seeded demo accounts; any two, e.g. student3 and student1 |

**Steps**
1. Log in as student3.
2. Click **Logout**. The login page opens (no page reload).
3. Log in as student1 in the same tab.
4. Look at **Logout** in the top bar and click it.

**Expected (F-02 section 2):** Logout is enabled; clicking it ends the session and opens the login page.
**Actual:** Logout is disabled. Clicking does nothing; student1 stays logged in until the page is
reloaded.

**Severity: Major.** Log out is a Sprint 1 feature and fails in the normal case of two people
using one browser. On a shared computer the second user cannot log out, so the next person can
act as them. Reloading works around it, but users cannot be expected to know that.

**Cause:** `client/src/App.tsx`, `TopBar`: `onLogout` sets `busy = true` and resets it only when
`signOut()` throws. `TopBar` stays mounted while logged out (it renders `null`), so `busy` is
still `true` at the next login.

**Why the tests missed it:** API tests call `/api/auth/logout` directly, and the E2E helper
`logIn` calls `page.goto("/login")`, which reloads the page and resets the state.

**Evidence:** dry-run notes (section 4 below); RED test output `evidence/lab6-logout-red.txt`
(Part D).

## 3. Triage of findings received from the UAT Team

All findings from the UAT Team are listed here, including "none" if there are none. If the UAT
Team reports the Logout defect, it is a duplicate of #58.

| # | UAT Issue | Case | Summary | Classification | Reason (Sprint 1 contract + evidence) | Duplicate of | Severity | Owner | Fix status | Disposition |
|---|---|---|---|---|---|---|---|---|---|---|
| _none received yet_ | | | | | | | | | | |

Classification is one of: accepted defect, duplicate, not-defect, enhancement. Reproduce and
clarify a report before calling it not-defect.

## 4. Product Team dry-run (2026-11-18, not UAT)

Run by Claude (AI agent) for Pan on `cbcb783` locally (fresh PostgreSQL in Docker, migrate +
seed). D = Fri 20 Nov 2026. Purpose: check the steps and expected texts before the handoff.

| Case | Result | Notes |
|---|---|---|
| UAT-05 | Pass | Same "Invalid email or password." for both; password field cleared after a failure; `/bookings` logged out goes to `/login` |
| UAT-02 | Pass | "You already have an upcoming booking."; "This slot overlaps one of your slots."; "This start time is in the past."; schedule unchanged |
| UAT-03 | Pass | Other student's booking and `/bookings/999999` both "Booking not found."; other advisor "Booking not found."; role pages show the 403 messages |
| UAT-01 | Pass, but hit #58 | Second Logout in the same tab was disabled |
| UAT-04 | Pass | Not affected by #58: step 2 reloads the page, which resets the client state, so the Logout in step 4 works. (An earlier version of these notes said UAT-04 also hit #58; that was wrong, found in review of PR #61.) |

## 5. Documented minor limitations

_None so far._ A minor limitation counts only when the UAT Team explicitly accepts it (Part D).
