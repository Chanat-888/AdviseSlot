# F-01 Log in: Engineering Contract

| Item | Value |
|---|---|
| Feature | F-01 Log in |
| Sprint | 1 |
| Owner | Chanat Dachkhumhang (reviewer: Jeerasak Phisawong) |
| Status | Contract draft. Implementation not started. |
| Linked requirements | FR-01, BR-10, NFR-01, NFR-02 (see section 1) |
| Depends on | none |
| Needed by | F-02, F-03 and every protected feature |
| Related documents | `docs/srs.md` (v0.4), `docs/features.md`, `docs/traceability.md`, `docs/system-sds.md` sections 4, 5, 7 |

## Version history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-04 | Chanat (drafted with an AI agent) | First contract, written before implementation. Awaiting team review. |
| 0.2 | 2026-11-04 | Chanat (drafted with an AI agent) | Team answers applied: AC-F01-05 and TEST-F01-05 for the 400 validation case; cookie `Max-Age=7200`; login returns `{ id, name, email, role }` like `/me`; email is trimmed and lowercased (D-26); expired rows are not cleaned up (known limitation); STS notes on the test clock. |

## 1. Linked requirements

| ID | Text (short) | How F-01 meets it |
|---|---|---|
| FR-01 | A user logs in with email and password. The system creates a session and returns the user's name and role. | `POST /api/auth/login` (section 4). The response carries name and role, plus id and email so it has the same shape as `GET /api/auth/me`. |
| BR-10 | A session expires 2 hours after login, with no renewal. | `Session.expiresAt` = login time + 2 hours. Expired sessions are rejected (AC-F01-04). |
| NFR-01 | Passwords are stored only as bcrypt hashes (cost 12). No plaintext in the database or logs. | Login compares with `bcrypt.compare` against `User.passwordHash`. The password is never stored or logged (AC-F01-03). |
| NFR-02 | Every protected endpoint returns 401 to an unauthenticated request, with no private data. | F-01 builds the session lookup that `requireAuth` uses (section 3.4). The 401 check of each protected endpoint is AC-R01-01. |
| Also relevant | NFR-07 (error shape), D-21 (2-hour session), D-26 (email trimmed and lowercased), SDS section 7 | Errors use the SDS error format (section 4.3). |

## 2. Behavior and workflow

1. The user opens `/login` and enters email and password.
2. The client sends `POST /api/auth/login` with `{ email, password }`.
3. The server validates the body (section 3.1), then trims and lowercases the email (D-26).
4. The server looks up the user by that email. Seeded emails are stored in lowercase.
   - Unknown email: run a dummy bcrypt compare (similar timing, SDS section 7), then respond 401 `INVALID_CREDENTIALS`.
   - Known email: `bcrypt.compare(password, passwordHash)`. A mismatch gives the same 401.
5. On a match the server generates a random 32-byte token, stores only its SHA-256 hash in a new `Session` row with `expiresAt` = now + 2 hours, and sets the `sid` cookie with the raw token (section 4.2).
6. The server responds 200 with the user's id, name, email and role.
7. The client calls `GET /api/auth/me` (F-03) and sends a student to `/slots` and an advisor to `/schedule` (SDS section 4.1).

"Now" is the server clock, never a time from the client (SRS section 5).

Dependencies: none. F-01 needs the seeded `User` rows (seed accounts Issue) to be testable.

## 3. Validation, failures and boundaries

### 3.1 Input validation

| Field | Rule |
|---|---|
| `email` | Required, a string, not empty after trimming. Trimmed and converted to lowercase before the lookup (D-26), so `" Student1@Example.test "` finds `student1@example.test`. |
| `password` | Required, a string, not empty. The password is not trimmed. |
| Body | Must be a JSON object. Unknown extra fields are ignored. |

A request that fails validation returns 400 `VALIDATION_ERROR` without touching the database.

### 3.2 Failure and boundary cases

| Case | Result | Verified by |
|---|---|---|
| Valid email and password | 200, `sid` cookie set, `Session` row created | AC-F01-01 |
| Known email, wrong password | 401 `INVALID_CREDENTIALS`, no cookie, no `Session` row | AC-F01-02 |
| Unknown email | 401 `INVALID_CREDENTIALS`, same status, code and message as above, no cookie, no `Session` row | AC-F01-02 |
| Missing or empty `email` or `password`, or a non-string value | 400 `VALIDATION_ERROR`, no cookie, no `Session` row | AC-F01-05 (the shared error shape is also checked by AC-R02-01) |
| Stored password is the bcrypt hash, not the plaintext | `User.passwordHash` matches `^\$2[aby]\$12\$` and differs from the plaintext | AC-F01-03 |
| Session used at least 2 hours after login | 401 `UNAUTHENTICATED` on any protected endpoint | AC-F01-04 |
| Session used 1 hour 59 min 59 s after login | Accepted | AC-F01-04 |
| Email with spaces or capitals (`" Student1@Example.test "`) and the right password | 200, same as the lowercase email (D-26) | AC-F01-01 |
| Login while already holding a valid session | A new session is created. The old session is not revoked and stays valid until it expires or is logged out. | TEST-F01-01 (step 3) |
| Response body for a failed login | Same shape for both causes. It never says whether the email exists. | AC-F01-02 |
| Logs | No password and no raw token is written to logs | Code review checklist (NFR-01) |

Session expiry boundary (confirmed by the team): a session is valid while `now < expiresAt`. At
exactly 2 hours (`now >= expiresAt`) it is rejected, like the "at or after the deadline" style of BR-06.

Known limitation (Sprint 1): expired `Session` rows are not cleaned up. They stay in the table
until logout. No cleanup job is built in this sprint.

### 3.3 Permissions

| Caller | Allowed |
|---|---|
| Anyone, no session needed | Yes. This is the only way to get a session. |
| Student and Advisor | The same endpoint and the same rules. The role is read from the `User` row, never from the request. |

The request cannot choose a role or a user id. There is no role selector (Deliverable 1 section 3.6).

### 3.4 Session lookup used by later features

F-01 defines how a session is created. The lookup is used by `requireAuth` (R-01):
read the `sid` cookie, SHA-256 hash it, find the `Session` by `tokenHash`, reject if there is no
row or `expiresAt` is not after now, then load the user. The rejection is 401 `UNAUTHENTICATED`
and the response clears the `sid` cookie. `requireAuth` does not delete the expired row (known
limitation above).

## 4. API contract

### 4.1 Request

`POST /api/auth/login`, JSON body, no authentication.

```json
{ "email": "advisor1@example.test", "password": "<the seeded demo password>" }
```

(The example email is a placeholder. Real seed values are in the seed script and README, not in this document.)

### 4.2 Success response

`200 OK`

```
Set-Cookie: sid=<random token>; Max-Age=7200; HttpOnly; SameSite=Lax; Path=/; Secure (production only)
```

```json
{ "id": 1, "name": "Dr. Example Advisor", "email": "advisor1@example.test", "role": "ADVISOR" }
```

The body has the same shape as `GET /api/auth/me` (F-03).

| Field | Type | Notes |
|---|---|---|
| `id` | integer | `User.id` |
| `name` | string | `User.name` |
| `email` | string | `User.email` (lowercase) |
| `role` | `"STUDENT"` or `"ADVISOR"` | `User.role` |

The body never contains `passwordHash`, the token or the token hash. The cookie attributes are
those of SDS section 7 (v0.5), including `Max-Age=7200` (2 hours, the same as `expiresAt`). The
server-side `expiresAt` stays the authority.

### 4.3 Error responses

Format (SDS section 5): `{ "error": { "code": "...", "message": "..." } }`.

| Status | `code` | `message` (readable text) | When |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | "Email and password are required." | Section 3.1 fails. |
| 401 | `INVALID_CREDENTIALS` | "Invalid email or password." | Unknown email or wrong password. |
| 500 | `INTERNAL_ERROR` | "Something went wrong." | Unexpected error. No stack trace or SQL error in the body. |

No new error codes are introduced. All three exist in the SDS.

## 5. UI behavior

Screen `/login` (SDS section 4.1), role: anyone.

| Part | Behavior |
|---|---|
| Form | Email field, password field (masked), Log in button. |
| Client check | Empty email or password shows a field message before sending. The server's answer is authoritative (SDS section 4.2). |
| Loading | While the request runs a spinner shows and the button is disabled, to stop double clicks. |
| Error | A Bootstrap alert shows the server's `message` ("Invalid email or password."). The password field is cleared; the email stays. |
| Success | The client calls `GET /api/auth/me`, then goes to `/slots` (student) or `/schedule` (advisor). |
| Route guard | An unauthenticated visit to any other route redirects to `/login`; a 401 from the API sends the user to `/login`. |
| Credentials | The client sends requests with `credentials: "include"`. It never stores the password or token (the cookie is httpOnly). |

## 6. Data

| Layer | Change |
|---|---|
| Existing | `User` (id, name, email unique, passwordHash, role, createdAt) and `Role` already exist in `server/prisma/schema.prisma`. F-01 does not change them except to add the relation field below. |
| New model | `Session` is added on top of `User` and `Role`. |
| Migration | A new Prisma migration creates the `Session` table (for example `prisma migrate dev --name add_session`). It is a normal migration, no raw SQL needed. |
| Seed | Needs the seeded users (a separate Issue). Passwords are stored as bcrypt cost 12 hashes. |

Planned Prisma model (SDS section 3):

```prisma
model Session {
  id        Int      @id @default(autoincrement())
  userId    Int
  user      User     @relation(fields: [userId], references: [id], onDelete: Restrict)
  tokenHash String   @unique
  expiresAt DateTime @db.Timestamptz(3)
}

// in model User, add the back-relation:
//   sessions Session[]
```

| Field | Constraint |
|---|---|
| `tokenHash` | Unique (SDS section 3.1). SHA-256 hex of the raw token. The raw token is never stored. |
| `expiresAt` | `timestamptz(3)`, set to login time + 2 hours. |
| `userId` | Foreign key to `User`, delete restricted (SDS section 3.1). |

New dependency for the implementation: a bcrypt library (cost 12) and cookie handling. These are
implementation details of the F-01 PR, not requirements.

## 7. Acceptance criteria

| AC | Criterion | Expected, observable outcome |
|---|---|---|
| AC-F01-01 | Valid email and password create a session cookie and return name and role. | 200. The `sid` cookie is set with `HttpOnly`, `SameSite=Lax` and `Max-Age=7200`. The body is `{ id, name, email, role }` matching the user. The email is accepted with spaces or capitals (D-26). One `Session` row exists for the user with `expiresAt` about 2 hours after the request. The response has no `passwordHash`. |
| AC-F01-02 | Wrong password or unknown email returns 401 with the same generic message and no session. | Both cases return 401 `INVALID_CREDENTIALS` with identical body. No `sid` cookie is set. The number of `Session` rows does not change. |
| AC-F01-03 | The seeded user's stored password is a bcrypt hash (cost 12), never the plaintext. | The `passwordHash` of a seeded user matches `^\$2[aby]\$12\$`, is not equal to the demo password, and `bcrypt.compare(demoPassword, passwordHash)` is true. |
| AC-F01-04 | A session is rejected (401) once 2 hours have passed since login. | After login, a protected request at login + 1 h 59 min 59 s returns 200; at login + 2 h 00 min 00 s it returns 401 `UNAUTHENTICATED` and no user data. |
| AC-F01-05 | A login body that fails validation is rejected with 400 `VALIDATION_ERROR`. | An empty body, a missing or empty `email` or `password`, or a non-string value returns 400 with `code` `VALIDATION_ERROR` and a readable `message`. No `sid` cookie is set and no `Session` row is created. No stack trace or SQL text in the body. |

## 8. Software Test Specification (STS)

Test files: `server/tests/auth.login.test.ts` (API, Supertest against the `_test` database).
Test clock: sessions are real database rows. Tests call `vi.useFakeTimers({ toFake: ['Date'] })`
and then `vi.setSystemTime(...)`, so only `Date` is faked and bcrypt and the database driver keep
working. `expiresAt` is computed in JavaScript (`new Date(Date.now() + 2 h)`), not by a database
`now()` default, because a fake `Date` does not move the database clock.

| TEST | AC | Level | Precondition / input | Action | Expected |
|---|---|---|---|---|---|
| TEST-F01-01 | AC-F01-01 | API | Test database seeded with a student and an advisor (lowercase emails). | 1. `POST /api/auth/login` with each user's correct email and password. 2. Log in the student with the email `"  Student1@Example.test "` style (spaces, capitals). 3. Log in the same user a second time and call `/me` with the first cookie. | 1: 200. `Set-Cookie` has `sid=`, `HttpOnly`, `SameSite=Lax`, `Max-Age=7200`. Body equals `{ id, name, email, role }` for that user and has no other field. `Session` has one new row for the user, `tokenHash` is not the cookie value, `expiresAt` is within 5 seconds of now + 2 h. 2: 200 for the same user. 3: the second login is 200 with a new cookie, and the first cookie still gets 200 from `/me`. |
| TEST-F01-02 | AC-F01-02 | API | Seeded user exists. Count of `Session` rows noted. | Case a: right email, wrong password. Case b: unknown email, any password. | Both: 401, body `{ error: { code: "INVALID_CREDENTIALS", message: ... } }`, bodies deep-equal each other, no `Set-Cookie`, `Session` count unchanged. |
| TEST-F01-03 | AC-F01-03 | API (database) | Seed has been run. Demo password from the seed config. | Read the seeded `User` row with Prisma. | `passwordHash` matches `^\$2[aby]\$12\$`, differs from the plaintext, and `bcrypt.compare` returns true. |
| TEST-F01-04 | AC-F01-04 | API (database, clock) | A user logs in at time T (`vi.setSystemTime(T)`). | Call a protected endpoint (`GET /api/auth/me`) with the cookie at T + 1 h 59 min 59 s, then at T + 2 h. | First call 200. Second call 401 `UNAUTHENTICATED` with no user fields. |
| TEST-F01-05 | AC-F01-05 | API | Invalid login bodies: empty body, missing `password`, missing `email`, `email: 123`, `password: ""`. `Session` count noted. | `POST /api/auth/login` once per body. | Each: 400, `error.code` is `VALIDATION_ERROR`, `error.message` is a non-empty string, no `Set-Cookie`, `Session` count unchanged, body has no stack trace or SQL text. |

UI/E2E: the Playwright journey (separate Issue) logs in through `/login` as an advisor and as a
student and checks the redirect to `/schedule` and `/slots`, and shows the alert message for a
wrong password (AC-R02-02, TEST-R02-02). It adds no new TEST id to F-01.

### 8.1 TDD plan

TEST-F01-01, -02, -04 and -05 are written first and run to show they fail (no endpoint yet). The
failing run (test names and output) is kept as evidence, then the implementation makes them pass.
The contract and the tests are committed before the implementation commit.

## 9. Known limitations (Sprint 1)

- Expired `Session` rows are not deleted (section 3.2). `requireAuth` answers 401 and clears the cookie only.
- Logging in again does not revoke earlier sessions (section 3.2).

## 10. Completion evidence

Recorded when the feature is done, in the F-01 implementation PR and in Part F of the PDF:
failing-then-passing test run, `npm test` output with counts, PR link and reviewer, and the
Issue link. The Product Definition of Done is in `definition-of-done.md`.
