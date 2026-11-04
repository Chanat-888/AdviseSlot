# F-02 Log out: Engineering Contract

| Item | Value |
|---|---|
| Feature | F-02 Log out |
| Sprint | 1 |
| Owner | Chanat Dachkhumhang (reviewer: Jeerasak Phisawong) |
| Status | Contract draft. Implementation not started. |
| Linked requirements | FR-02, BR-10 (see section 1) |
| Depends on | F-01 |
| Related documents | `docs/srs.md` (v0.4), `docs/features.md`, `docs/traceability.md`, `docs/system-sds.md` sections 4, 5, 7, `docs/sprints/sprint-1/F-01-login.md` |

## Version history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-04 | Chanat (drafted with an AI agent) | First contract, written before implementation. Awaiting team review. |
| 0.2 | 2026-11-04 | Chanat (drafted with an AI agent) | Team answers applied: AC-F02-02 and TEST-F02-02 (logout ends only the current session; the "other session stays valid" check moved out of AC-F02-01). 204 and 401 behavior confirmed. |

## 1. Linked requirements

| ID | Text (short) | How F-02 meets it |
|---|---|---|
| FR-02 | A logged-in user logs out. The system ends the session so later requests with it are rejected. | `POST /api/auth/logout` deletes the `Session` row and clears the cookie. |
| BR-10 | A session expires 2 hours after login. Logout ends it immediately. | The session ends at once, before `expiresAt` (AC-F02-01). |
| Also relevant | NFR-02 (401 without a session), NFR-07 (error shape) | An unauthenticated logout is a 401 with the SDS error format. Its test is the shared TEST-R01-01. |

## 2. Behavior and workflow

1. A logged-in user clicks Logout in the top bar.
2. The client sends `POST /api/auth/logout` with the `sid` cookie.
3. `requireAuth` finds the session from the cookie (F-01 section 3.4). With no valid session the request ends with 401 `UNAUTHENTICATED`.
4. The server deletes that one `Session` row (matched by the hash of the cookie token).
5. The server clears the `sid` cookie and responds 204 with no body.
6. The client clears its stored user state and goes to `/login`.
7. A later request with the old cookie value finds no `Session` row and returns 401 `UNAUTHENTICATED`.

Dependencies: F-01 (a session must exist).

## 3. Validation, failures and boundaries

### 3.1 Input

No body and no parameters. The only input is the `sid` cookie.

### 3.2 Failure and boundary cases

| Case | Result | Verified by |
|---|---|---|
| Logged-in user logs out | 204, cookie cleared, `Session` row deleted | AC-F02-01 |
| Reuse of the old cookie after logout, on any protected endpoint | 401 `UNAUTHENTICATED`, no private data | AC-F02-01 |
| Logout with no cookie, an unknown token or an expired session | 401 `UNAUTHENTICATED` | AC-R01-01 / TEST-R01-01 (shared, owned by R-01) |
| Logout twice with the same cookie | The second call is 401 `UNAUTHENTICATED` (the row is gone) | AC-F02-01 |
| Another session of the same user (for example another browser) | Not affected. Only the session of the cookie sent is deleted. | AC-F02-02 |
| Database error | 500 `INTERNAL_ERROR`, generic message | R-02 |

### 3.3 Permissions

| Caller | Allowed |
|---|---|
| Student | Yes, own session only |
| Advisor | Yes, own session only |
| No valid session | No. 401 `UNAUTHENTICATED` |

Matches SDS section 6: "Log in, log out, view own identity: Yes, Yes, own session only."
No 403 or 404 applies. The session is identified by the cookie, never by an id in the request.

## 4. API contract

### 4.1 Request

`POST /api/auth/logout`, no body, cookie `sid` required.

### 4.2 Success response

`204 No Content`, empty body.

```
Set-Cookie: sid=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/; Secure (production only)
```

The cleared cookie uses the same `Path` and attributes as the one set at login, so the browser removes it.

### 4.3 Error responses

| Status | `code` | `message` | When |
|---|---|---|---|
| 401 | `UNAUTHENTICATED` | "You are not logged in." | No cookie, unknown token or expired session. |
| 500 | `INTERNAL_ERROR` | "Something went wrong." | Unexpected error. No stack trace in the body. |

Format: `{ "error": { "code": "...", "message": "..." } }` (SDS section 5). No new codes.

## 5. UI behavior

| Part | Behavior |
|---|---|
| Control | A Logout button in the top bar, next to the user's name and role (SDS section 4.1). Shown only when logged in. |
| Loading | The button is disabled while the request runs. |
| Success | The client clears its user state and goes to `/login`. |
| Failure | If the server answers 401 (session already gone), the client still clears its state and goes to `/login`. For any other error, an alert shows the server's `message` and the user stays logged in. |
| After logout | Opening a protected route redirects to `/login`. The browser Back button must not show private data without a new `GET /api/auth/me` check (the guard calls `/me`). |

## 6. Data

| Layer | Change |
|---|---|
| Database | No schema change. Uses the `Session` model added by F-01. Logout deletes one row. |
| Migration | None. |
| Seed | None. |

## 7. Acceptance criteria

| AC | Criterion | Expected, observable outcome |
|---|---|---|
| AC-F02-01 | After logout, a request with the old session cookie returns 401. | The logout call returns 204 and clears `sid`. The `Session` row for that token no longer exists. `GET /api/auth/me` with the old cookie value returns 401 `UNAUTHENTICATED` with no user data. A second logout with the old cookie also returns 401. |
| AC-F02-02 | Logout ends only the current session; other sessions of the same user stay valid. | The user has two sessions (two logins, cookies A and B). Logout with cookie A deletes only A's `Session` row. B's row remains and `GET /api/auth/me` with cookie B still returns 200 with the user's identity. |

## 8. Software Test Specification (STS)

Test file: `server/tests/auth.logout.test.ts` (API, Supertest against the `_test` database).

| TEST | AC | Level | Precondition / input | Action | Expected |
|---|---|---|---|---|---|
| TEST-F02-01 | AC-F02-01 | API | A seeded user logs in (cookie A). | 1. `POST /api/auth/logout` with cookie A. 2. `GET /api/auth/me` with cookie A. 3. `POST /api/auth/logout` with cookie A again. | 1: 204, `Set-Cookie` clears `sid`, the row for A is gone. 2: 401 `UNAUTHENTICATED`, no user fields. 3: 401 `UNAUTHENTICATED`. |
| TEST-F02-02 | AC-F02-02 | API | A seeded user logs in twice (cookies A and B). Two `Session` rows exist for the user. | 1. `POST /api/auth/logout` with cookie A. 2. `GET /api/auth/me` with cookie B. | 1: 204. Only the row for A is deleted; the row for B remains. 2: 200 with the user's identity. |
| TEST-R01-01 (shared, owned by R-01) | AC-R01-01 | API | No cookie. | `POST /api/auth/logout` without a cookie (and the other protected endpoints). | 401 `UNAUTHENTICATED`, error shape only, no private data. |

UI/E2E: the Playwright journey logs in, clicks Logout, lands on `/login`, and then tries to open
a protected route and is sent back to `/login`. It adds no new TEST id to F-02.

### 8.1 TDD plan

TEST-F02-01 and TEST-F02-02 are written first and shown failing (no endpoint), then the implementation makes it
pass. The failing run is kept as evidence. The contract is committed before the implementation.

## 9. Completion evidence

Failing-then-passing run of TEST-F02-01 and TEST-F02-02, `npm test` output with counts, PR link and reviewer,
Issue link. See `definition-of-done.md`.
