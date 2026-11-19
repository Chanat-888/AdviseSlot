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
| PR | #59 into `sprint-1`, reviewer @ShitheadQuin, linked to #58 | Open; first review (comments) answered, waiting for approval |
| CI | `test-and-docker` on PR #59 | Passed |
| Merge into `sprint-1` | by Snooker (reviewer) | _TBD_ |
| Release PR `sprint-1` → `main` | _TBD_ | _TBD_ |
| Deploy and smoke check | _TBD_ | _TBD_ |
| UAT Team retest | _TBD_ | _TBD_ |
| Issue closed | by hand after retest | _TBD_ |

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
| PR review text | See below; approval _TBD_ |
| Merge commit into `sprint-1` | _TBD_ |
| Release PR to `main` | _TBD_ |
| Corrected `main` commit | _TBD_ |
| Deploy workflow run | _TBD_ |
| Cloud Run revision | _TBD_ |
| `/api/version` after deploy | _TBD_ |
| Smoke check (manual) | _TBD: log in, log out, log in as another user, log out; footer shows the new commit_ |

PR #59 review by Jeerasak Phisawong (@ShitheadQuin), 2026-11-19, "Comment":

| # | Where | Review comment (short) | Answer |
|---|---|---|---|
| 1 | PR | UAT-01 step 7, UAT-04 and the dry-run notes are not on any branch. | They are in PR #61 (`docs/labs/lab-06/`); the dry-run is Part C section 4. |
| 2 | `journey.spec.ts` | The test cites AC-F02-01, which only covers the API; F-02 section 8 says the journey adds no new case. | The test now cites FR-02 and F-02 section 2 steps 1 and 6. F-02 section 8 (v0.3) describes the second E2E case. |
| 3 | `App.tsx` / `logIn` | The "logIn reloads the page" lesson should be next to the helper. | A comment above `logIn` now warns about it. |
| 4 | PR | `Closes #58` will not close the Issue on `sprint-1`. | Known; Pan closes #58 by hand after the merge. |

## 5. Independent retest and Sprint 1 decision (UAT Team fills)

Give the UAT Team the corrected version and the original steps (#58 and UAT-01, UAT-04).

| Issue / case | Corrected version | Tester (name, team) | Date | Actual result | PASS / FAIL | Evidence ID |
|---|---|---|---|---|---|---|
| #58 | | | | | | |
| UAT-01 (re-run) | | | | | | |
| UAT-04 (re-run) | | | | | | |
| _other affected cases_ | | | | | | |

**Final Sprint 1 UAT decision:** _TBD: Accepted / Accepted with documented minor limitations /
Not Accepted_

| Field | Value |
|---|---|
| Release tested | _TBD (commit and revision)_ |
| UAT testers | _TBD_ |
| Date | _TBD_ |
| Conditions / accepted minor limitations | _TBD_ |
| How it was recorded | _TBD (e.g. comment on the Issue or signed form)_ |

Only the UAT Team may record acceptance. Do not claim it while any Critical/Major defect is open
or a required case is BLOCKED.
