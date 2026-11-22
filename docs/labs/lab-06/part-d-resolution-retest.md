# Part D: resolution and independent retest

Every accepted Critical/Major defect goes through: Issue → fix branch from `sprint-1` → RED test
→ fix (GREEN) → regression suite → teammate PR review → CI → release PR to `main` → deploy →
smoke check → UAT Team retest → acceptance decision.

## 1. Defect chain: Issue #58 (Logout disabled after re-login)

| Step | Evidence | Status |
|---|---|---|
| Issue | #58, Major, owner Chanat (Part C section 2) | Done |
| Fix branch | `fix/logout-busy` from `sprint-1` `280bbf9` | Done |
| RED test | `c50ec5a`, `evidence/lab6-logout-red.txt` | Done |
| Fix (GREEN) | `51490ea`, `evidence/lab6-logout-green.txt` | Done |
| PR | #59 into `sprint-1`, reviewer @ShitheadQuin, linked to #58 | Approved and merged by Snooker, 2026-11-19 |
| CI | `test-and-docker` on PR #59 | Passed |
| Merge into `sprint-1` | by Snooker (reviewer), merge commit `0eb6a52` | Done |
| Release PR `sprint-1` → `main` | #65 (after sync PR #64), approved and merged by Snooker, merge commit `c4dc3b4` | Done, 2026-11-20 |
| Deploy and smoke check | Deploy run 44739029326, revision `adviseslot-00005-4tw`, workflow smoke test passed (`/api/health`, `/api/ready`, `/`, `/api/slots/bookable`, `/api/version` = `c4dc3b4`; login step skipped, no smoke credentials), manual smoke check PASS | Done, 2026-11-20 19:54 ICT |
| UAT Team retest | Team Top 2 on #63: PASS on `c4dc3b4` / `adviseslot-00005-4tw` (section 5) | Done, 2026-11-22 |
| Issue closed | #58 closed by Snooker after the merge (2026-11-19); UAT Issue #63 closed by Chanat after the passing retest (2026-11-22) | Done |

Deploy rule: we do not deploy the fix until UAT round 1 on `cbcb783` is finished, and we tell
the UAT Team before any deploy (handout section 2).

## 2. Regression test (automated)

File `e2e/tests/journey.spec.ts`, test "a second user who logs in in the same tab can log out
(F-02)". The second login types into the login page that Logout left open, without
`page.goto`, because a reload would reset the state and hide the bug.

```ts
test("a second user who logs in in the same tab can log out (F-02)", async ({ page }) => {
  const first = SEED_USERS.find((u) => u.email === "student3@example.test")!;
  await logIn(page, first.email, /\/slots$/);
  await logOut(page);

  // Same tab, no reload: log in as Student One from the login page Logout left us on
  await page.getByLabel("Email").fill(student.email);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("navigation").getByText(`${student.name} (STUDENT)`)).toBeVisible();

  await expect(page.getByRole("button", { name: "Logout" })).toBeEnabled();
  await logOut(page);
  const me = await page.request.get("http://localhost:3100/api/auth/me");
  expect(me.status()).toBe(401);
});
```

### RED (2026-11-19, code `280bbf9`, unfixed `App.tsx`)

Command: `cd e2e && npx playwright test -g "second user" --reporter=list`

```
x  1 [chromium] › tests\journey.spec.ts:57:7 › E2E journey (Sprint 1, issue #13) ›
   a second user who logs in in the same tab can log out (F-02) (6.4s)
Error: expect(locator).toBeEnabled() failed
Locator:  getByRole('button', { name: 'Logout' })
Expected: enabled
Received: disabled
  9 × locator resolved to <button disabled type="button" class="btn btn-outline-secondary btn-sm">Logout</button>
1 failed
```

It fails on the reported behaviour (the button is disabled), not on setup.

### GREEN (2026-11-19, commit `51490ea`)

| Run | Command | Result |
|---|---|---|
| New test | `cd e2e && npx playwright test -g "second user"` | 1 passed |
| Full E2E | `cd e2e && npx playwright test --reporter=list` | 6 passed, 0 failed, 0 skipped |
| Client type check and build | `cd client && npm run build` | OK |
| Server tests | `cd server && npx vitest run` | 17 files, 174 passed |

Full output: `evidence/lab6-logout-green.txt` on `fix/logout-busy`.

## 3. Code change

```diff
   async function onLogout() {
     setBusy(true);
     try {
       await signOut();
     } catch (err) {
       alert(err instanceof ApiError ? err.message : "Something went wrong.");
+    } finally {
+      // TopBar stays mounted while logged out, so reset busy or the next user's Logout stays disabled.
       setBusy(false);
     }
   }
```

## 4. Review, release and deployment

| Item | Value |
|---|---|
| PR review text | See below |
| Merge commit into `sprint-1` | `0eb6a52` (2026-11-19, by @ShitheadQuin) |
| Release PR to `main` | #65 (sync PR #64 first, because `main` had merge commit `cbcb783`) |
| Corrected `main` commit | `c4dc3b42b8e929fa8775537172d1b6d01da7caae` (merged 2026-11-20 by @ShitheadQuin) |
| Deploy workflow run | https://github.com/Chanat-888/AdviseSlot/actions/runs/44739029326 (success) |
| Cloud Run revision | `adviseslot-00005-4tw`, 100% of traffic (previous: `adviseslot-00004-ksp` on `cbcb783`) |
| `/api/version` after deploy | `{"commit":"c4dc3b42b8e929fa8775537172d1b6d01da7caae"}` |
| Smoke check | Workflow smoke test: PASS for `/api/health`, `/api/ready`, `/`, `/api/slots/bookable` and `/api/version` (expected commit `c4dc3b4`); its login step was skipped because no smoke credentials are configured, so login and logout were checked manually. Manual check by Chanat on 2026-11-22, one tab, no reload: logged in as Student Three (D-01), Logout opened the login page with footer `c4dc3b4` (D-02), logged in as Student One in the same tab with Logout enabled (D-03), Logout opened the login page again (D-04). PASS |

PR #59 review by Jeerasak Phisawong (@ShitheadQuin), 2026-11-19, "Comment":

| # | Where | Review comment (short) | Answer |
|---|---|---|---|
| 1 | PR | UAT-01 step 7, UAT-04 and the dry-run notes are not on any branch. | They are in PR #61 (`docs/labs/lab-06/`); the dry-run is Part C section 4. |
| 2 | `journey.spec.ts` | The test cites AC-F02-01, which only covers the API; F-02 section 8 says the journey adds no new case. | The test now cites FR-02 and F-02 section 2 steps 1 and 6. F-02 section 8 (v0.3) describes the second E2E case. |
| 3 | `App.tsx` / `logIn` | The "logIn reloads the page" lesson should be next to the helper. | A comment above `logIn` now warns about it. |
| 4 | PR | `Closes #58` will not close the Issue on `sprint-1`. | Known; #58 is closed by hand after the merge. |

Second review, 2026-11-19: Snooker checked both fixes on `71e41ed` (CI green, E2E 6/6) and
approved: "Both comments addressed in 71e41ed (checked on the branch; CI green). Approving."

## 5. Independent retest and Sprint 1 decision (UAT Team fills)

Give the UAT Team the corrected version and the original steps (#58 and UAT-01).

| Issue / case | Corrected version | Tester (name, team) | Date | Actual result | PASS / FAIL | Evidence ID |
|---|---|---|---|---|---|---|
| #58 / UAT Issue #63 | `c4dc3b4`, `adviseslot-00005-4tw` | Team Top 2 (GitHub @Ryugc, Grittapob Chutitas) | 2026-11-22 | Signed in as Student Three on `/slots` and clicked Logout: signed out straight away, no hang and no reload needed. Their steps did not include the second login in the same tab (the exact #58 path), which we asked them to add; that path is covered by our E2E test (section 2) | PASS | Two screenshots in their comment on #63 (2026-11-22 10:54 ICT) |
| UAT-01 (re-run) | `c4dc3b4` | Team Top 2 | 2026-11-22 | Logged in with a first account, logged out, logged in as Student Three in the same tab without a reload, clicked Logout: signed out at once, no refresh needed (this is the #58 path) | PASS | Their decision comment on #63 |
| UAT-02 to UAT-05 | `cbcb783` (round 1) | Team Top 2 | 2026-11-20 | Not affected by the fix (only the Logout button changed); not re-run on `c4dc3b4` | PASS | Their decision comment on #63 |

Round 1 on `cbcb783` (2026-11-20): UAT-01 FAIL (#63), UAT-02 to UAT-05 PASS.

**Final Sprint 1 UAT decision (recorded by the UAT Team): Accepted.**

| Field | Value |
|---|---|
| Release tested | `c4dc3b4`, revision `adviseslot-00005-4tw` (round 1 on `cbcb783` / `adviseslot-00004-ksp`) |
| UAT testers | Team Top 2: Grittapob Chutitas (67070503402), Moe Thauk Ko (67070503483) |
| Date | 2026-11-22 |
| Conditions / accepted minor limitations | None. Their words: "With no Critical or Major defects remaining, Team Top 2 accepts AdviseSlot for Sprint 1." |
| How it was recorded | Comment by @Ryugc on #63, 2026-11-22 11:06 ICT (edited 11:11): https://github.com/Chanat-888/AdviseSlot/issues/63#issuecomment-7073981583. Also sent on the teams' Discord at 11:01 (screenshot N-03) |

Only the UAT Team may record acceptance. Do not claim it while any Critical/Major defect is open
or a required case is BLOCKED.
