## What and why

<!-- What changed and why. Cite FR/BR/NFR and D-xx IDs. -->

Closes #

## How to test

```bash
cd server && npm test
cd e2e && npx playwright test
```

## Checklist (`docs/workflow.md`, `docs/sprints/sprint-1/definition-of-done.md`)

- [ ] Base is `sprint-N` (or a stacked branch, said above), reviewer is the teammate, Issue linked in Development
- [ ] Contract and tests came before the code in the commit history (DoD 1, 5)
- [ ] `npm test` and `npm run build` pass for server and client; counts and any skipped test are below (DoD 4, 9)
- [ ] Protected endpoints: 401 without a session, 403 for the wrong role, 404 for another user's record; any new route is added to `server/tests/r01.auth.test.ts` (DoD 6, R-01)
- [ ] Errors use `{ error: { code, message } }` with no stack trace or SQL (DoD 7, R-02)
- [ ] **No secrets (R-03, TEST-R03-01):** no real password, token, key or `.env` in the diff; new configuration is an environment variable with a placeholder in `.env.example`; nothing secret in client code (only `VITE_` variables, which are public); `server/tests/r03.secrets.test.ts` passes
- [ ] README and affected docs match the code (DoD 13)
- [ ] Anything not done or failing is listed below (DoD 14)

## Not done / known issues

<!-- Or "None". -->
