"""Checks the live AdviseSlot service after a deploy. Never prints credentials or cookies.

Called by .github/workflows/deploy.yml:
    python3 deploy/smoke_test.py SERVICE_URL
Exits non-zero (failing the workflow) if a check fails. Each public check is tried up
to 5 times, 3 seconds apart, because a cold Cloud Run instance may need a few seconds.

Checks, in order:
  1. GET /api/health          -> 200 {"status": "ok"}
  2. GET /api/ready           -> 200 {"db": "up"}            (the database answers)
  3. GET /                    -> 200 HTML                     (the built React app is served)
  4. GET /api/slots/bookable  -> 401 UNAUTHENTICATED          (API routes and the auth guard work)
  5. Optional login, only if BOTH SMOKE_EMAIL and SMOKE_PASSWORD are set (both or neither):
     POST /api/auth/login, GET /api/auth/me, and for a STUDENT account
     GET /api/slots/bookable must return a non-empty list (migrate and seed worked).
     The session is always logged out, even if a check fails.

Adapted from the Lab 5 starter kit: AdviseSlot uses an httpOnly `sid` session cookie,
not a bearer token, and has no public data endpoint, so the seed is checked after login.
Standard library only. Offline tests: deploy/tests/test_smoke.py
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

SESSION_COOKIE = 'sid'  # server/src/session.ts


# HTTP helper: returns (status, headers, body). HTTP error codes are returned, not raised,
# because check 4 expects a 401. Network errors and timeouts still raise.
def request(base, path, data=None, cookie=None):
    headers = {}
    if data is not None:
        headers['Content-Type'] = 'application/json'
    if cookie:
        headers['Cookie'] = SESSION_COOKIE + '=' + cookie
    req = urllib.request.Request(base + path, headers=headers,
        data=json.dumps(data).encode() if data is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return response.status, response.headers, response.read()
    except urllib.error.HTTPError as err:
        return err.code, err.headers, err.read()


def session_cookie(headers):
    # The session cookie value from the login response's Set-Cookie headers, or None.
    for header in headers.get_all('Set-Cookie') or []:
        name, _, rest = header.partition('=')
        if name.strip() == SESSION_COOKIE:
            return rest.split(';', 1)[0] or None
    return None


def is_json(body, **expected):
    data = json.loads(body)
    return all(data.get(key) == value for key, value in expected.items())


def check(base):
    # --- Public checks --------------------------------------------------------
    for path, want_status, predicate in (
        ('/api/health', 200, lambda b: is_json(b, status='ok')),
        ('/api/ready', 200, lambda b: is_json(b, db='up')),
        ('/', 200, lambda b: b'<html' in b.lower()),
        ('/api/slots/bookable', 401, lambda b: json.loads(b)['error']['code'] == 'UNAUTHENTICATED'),
    ):
        for attempt in range(5):
            try:
                status, _, body = request(base, path)
                if status != want_status or not predicate(body):
                    raise ValueError('Unexpected response')
                break
            except (urllib.error.URLError, TimeoutError, ValueError, KeyError, TypeError):
                if attempt == 4:
                    raise RuntimeError('Smoke check failed: ' + path) from None
                time.sleep(3)
        print('PASS ' + path)

    # --- Optional login check (only when both are set) ------------------------
    email, password = os.getenv('SMOKE_EMAIL'), os.getenv('SMOKE_PASSWORD')
    if bool(email) != bool(password):
        raise RuntimeError('Set both SMOKE_EMAIL and SMOKE_PASSWORD, or neither.')
    if not email:
        print('SKIP login: optional smoke credentials not configured')
        return
    cookie = None
    try:
        status, headers, _ = request(base, '/api/auth/login', {'email': email, 'password': password})
        cookie = session_cookie(headers)
        if status != 200 or not cookie:
            raise ValueError('Login failed')
        status, _, body = request(base, '/api/auth/me', cookie=cookie)
        if status != 200:
            raise ValueError('/api/auth/me failed')
        role = json.loads(body)['role']
        print('PASS login and /api/auth/me')
        if role == 'STUDENT':
            status, _, body = request(base, '/api/slots/bookable', cookie=cookie)
            slots = json.loads(body)
            if status != 200 or not isinstance(slots, list) or not slots:
                raise ValueError('No bookable slots')
            print('PASS /api/slots/bookable returns seeded slots')
    except (urllib.error.URLError, TimeoutError, ValueError, KeyError, TypeError):
        raise RuntimeError('Login smoke check failed') from None
    finally:
        # Always end the session, even when a check above failed.
        if cookie:
            request(base, '/api/auth/logout', data={}, cookie=cookie)
            print('PASS logout')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('Usage: python3 deploy/smoke_test.py SERVICE_URL')
    check(sys.argv[1].rstrip('/'))
