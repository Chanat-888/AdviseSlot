# F-03 Current user: Engineering Contract

| Item | Value |
|---|---|
| Feature | F-03 Current user |
| Sprint | 1 |
| Owner | Chanat Dachkhumhang (reviewer: Jeerasak Phisawong) |
| Status | Contract draft. Implementation not started. |
| Linked requirements | FR-03, NFR-02 (see section 1) |
| Depends on | F-01 |
| Needed by | The client's routing and route guard; the top bar |
| Related documents | `docs/srs.md` (v0.4), `docs/features.md`, `docs/traceability.md`, `docs/system-sds.md` sections 4, 5, 7, `docs/sprints/sprint-1/F-01-login.md` |

## Version history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-04 | Chanat (drafted with an AI agent) | First contract, written before implementation. Awaiting team review. |
| 0.2 | 2026-11-04 | Chanat (drafted with an AI agent) | Team answers applied: a 401 from an expired or unknown session clears the cookie and does not delete the row (known limitation, section 9). |

## 1. Linked requirements

| ID | Text (short) | How F-03 meets it |
|---|---|---|
| FR-03 | A logged-in user retrieves their own identity (id, name, email, role). | `GET /api/auth/me` returns exactly those four fields. |
| NFR-02 | Every protected endpoint returns 401 to an unauthenticated request, with no private data. | `GET /api/auth/me` is protected by `requireAuth`. Its 401 test is the shared TEST-R01-01. |
| Also relevant | NFR-07 (error shape), BR-10 (expired session gives 401) | Errors use the SDS format. An expired session gives 401 (tested in TEST-F01-04). |

## 2. Behavior and workflow

1. The client calls `GET /api/auth/me` after login (F-01), and when the app first loads or a page is reloaded.
2. `requireAuth` hashes the `sid` cookie token, finds the `Session`, checks that `now < expiresAt`, and loads the user (F-01 section 3.4).
3. If there is no valid session the server responds 401 `UNAUTHENTICATED`.
4. Otherwise the server responds 200 with `{ id, name, email, role }` of the session's user.
5. The client stores the result, shows the name and role in the top bar, and routes by role: students to `/slots`, advisors to `/schedule`. On 401 it goes to `/login`.

The endpoint reads only the session. It takes no user id from the request, so a user can only see their own identity.

Dependencies: F-01.

## 3. Validation, failures and boundaries

### 3.1 Input

No body, no parameters, no query. The only input is the `sid` cookie.

### 3.2 Failure and boundary cases

| Case | Result | Verified by |
|---|---|---|
| Valid session | 200 with `{ id, name, email, role }` | AC-F03-01 |
| Response content | Exactly four fields. No `passwordHash`, no token, no `createdAt`. | AC-F03-01 |
| Two users logged in (two cookies) | Each gets their own identity | AC-F03-01 |
| No cookie, unknown token | 401 `UNAUTHENTICATED`, no user data | AC-R01-01 / TEST-R01-01 (shared, owned by R-01) |
| Expired session (login + 2 h) | 401 `UNAUTHENTICATED` | AC-F01-04 / TEST-F01-04 |
| Session after logout | 401 `UNAUTHENTICATED` | AC-F02-01 / TEST-F02-01 |
| Database error | 500 `INTERNAL_ERROR`, generic message | R-02 |

### 3.3 Permissions

| Caller | Allowed |
|---|---|
| Student | Yes, own identity only |
| Advisor | Yes, own identity only |
| No valid session | No. 401 `UNAUTHENTICATED` |

Matches SDS section 6 ("view own identity", own session only). No 403 or 404 applies.

## 4. API contract

### 4.1 Request

`GET /api/auth/me`, no body, cookie `sid` required.

### 4.2 Success response

`200 OK`

```json
{ "id": 2, "name": "Example Student", "email": "student1@example.test", "role": "STUDENT" }
```

| Field | Type | Notes |
|---|---|---|
| `id` | integer | `User.id` |
| `name` | string | `User.name` |
| `email` | string | `User.email` |
| `role` | `"STUDENT"` or `"ADVISOR"` | `User.role` |

(Example values are placeholders.) The shape is the one in SDS section 7.

### 4.3 Error responses

| Status | `code` | `message` | When |
|---|---|---|---|
| 401 | `UNAUTHENTICATED` | "You are not logged in." | No cookie, unknown token, expired or deleted session. The `sid` cookie is cleared in the response. |
| 500 | `INTERNAL_ERROR` | "Something went wrong." | Unexpected error. No stack trace in the body. |

Format: `{ "error": { "code": "...", "message": "..." } }` (SDS section 5). No new codes.

## 5. UI behavior

| Part | Behavior |
|---|---|
| App start | Before showing a protected screen the client calls `/me`. A spinner shows while it runs. |
| Success | The user's name and role appear in the top bar. A student on `/` or after login goes to `/slots`, an advisor to `/schedule`. |
| 401 | The client redirects to `/login` (SDS section 4.2). |
| Role routing | The client hides screens of the other role. This is convenience only. The server enforces roles on every endpoint (R-01). |
| Other error | An alert shows the server's `message`. |

## 6. Data

| Layer | Change |
|---|---|
| Database | No schema change. Reads `Session` (added by F-01) and `User`. |
| Migration | None. |
| Seed | None beyond the seeded users used by F-01. |

## 7. Acceptance criteria

| AC | Criterion | Expected, observable outcome |
|---|---|---|
| AC-F03-01 | A logged-in user gets their own id, name, email and role. | 200. The body is exactly `{ id, name, email, role }` equal to the logged-in user's row. A second user's cookie returns the second user's identity. The body has no `passwordHash` or token. |

## 8. Software Test Specification (STS)

Test file: `server/tests/auth.me.test.ts` (API, Supertest against the `_test` database).

| TEST | AC | Level | Precondition / input | Action | Expected |
|---|---|---|---|---|---|
| TEST-F03-01 | AC-F03-01 | API | A seeded student and a seeded advisor, each logged in (cookies S and A). | `GET /api/auth/me` with cookie S, then with cookie A. | S: 200 and body deep-equals `{ id, name, email, role: "STUDENT" }` of the student, with no other key. A: the same for the advisor with `role: "ADVISOR"`. Neither body contains `passwordHash`. |
| TEST-R01-01 (shared, owned by R-01) | AC-R01-01 | API | No cookie. | `GET /api/auth/me` without a cookie. | 401 `UNAUTHENTICATED`, error shape only. |

UI/E2E: the Playwright journey reloads the page after login and stays on the role's home screen
(the client restored the user from `/me`). It adds no new TEST id to F-03.

### 8.1 TDD plan

TEST-F03-01 is written first and shown failing (no endpoint), then made to pass. The failing run is kept as evidence.

## 9. Known limitations (Sprint 1)

- When `requireAuth` rejects an expired session it answers 401 and clears the `sid` cookie, but does not delete the expired `Session` row. There is no cleanup of expired sessions in Sprint 1 (see F-01 section 3.2).

## 10. Completion evidence

Failing-then-passing run of TEST-F03-01, `npm test` output with counts, PR link and reviewer,
Issue link. See `definition-of-done.md`.
