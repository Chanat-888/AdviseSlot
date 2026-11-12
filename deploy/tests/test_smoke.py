"""Offline unit tests for deploy/smoke_test.py (the network is mocked).

Run (repo root):  python3 -m unittest discover -s deploy/tests -p 'test_smoke.py'

Covers: public checks pass and login is skipped without credentials; a database that is
not ready fails even though HTTP answers; an API that does not reject a logged-out user
fails; a student login sees seeded slots; an empty slot list fails; the session is logged
out even if a check fails; only one of the two credentials set is an error; with
EXPECTED_COMMIT, the running commit must match.
"""
import importlib.util
from email.message import Message
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('smoke', Path(__file__).parents[1] / 'smoke_test.py')
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)

CREDS = {'SMOKE_EMAIL': 'student1@example.test', 'SMOKE_PASSWORD': 'test-only'}
COMMIT = '0123456789abcdef0123456789abcdef01234567'


def headers(set_cookie=None):
    h = Message()
    if set_cookie:
        h['Set-Cookie'] = set_cookie
    return h


class SmokeTests(unittest.TestCase):
    def response(self, base, path, data=None, cookie=None):
        if path == '/api/slots/bookable' and cookie:
            return 200, headers(), b'[{"id":1}]'
        return {
            '/api/health': (200, headers(), b'{"status":"ok","db":"up"}'),
            '/api/ready': (200, headers(), b'{"status":"ready","db":"up"}'),
            '/': (200, headers(), b'<!doctype html><html></html>'),
            '/api/slots/bookable': (401, headers(), b'{"error":{"code":"UNAUTHENTICATED","message":"x"}}'),
            '/api/auth/login': (200, headers('sid=test-session; Path=/; HttpOnly'), b'{"id":1}'),
            '/api/auth/me': (200, headers(), b'{"id":1,"role":"STUDENT"}'),
            '/api/auth/logout': (204, headers(), b''),
            '/api/version': (200, headers(), b'{"commit":"' + COMMIT.encode() + b'"}'),
        }[path]

    @patch.dict('os.environ', {'EXPECTED_COMMIT': COMMIT}, clear=True)
    def test_running_commit_matches_the_release(self):
        with patch.object(smoke, 'request', side_effect=self.response) as req:
            smoke.check('https://demo.test')
            self.assertEqual(req.call_args.args[1], '/api/version')

    @patch.dict('os.environ', {'EXPECTED_COMMIT': 'f' * 40}, clear=True)
    def test_old_commit_still_running_fails(self):
        with patch.object(smoke, 'request', side_effect=self.response), patch.object(smoke.time, 'sleep'):
            with self.assertRaisesRegex(RuntimeError, '/api/version'):
                smoke.check('https://demo.test')

    @patch.dict('os.environ', {}, clear=True)
    def test_public_checks_pass_and_skip_optional_login(self):
        with patch.object(smoke, 'request', side_effect=self.response) as req:
            smoke.check('https://demo.test')
            self.assertEqual(req.call_count, 4)

    @patch.dict('os.environ', {}, clear=True)
    def test_db_not_ready_fails_even_when_http_responds(self):
        def down(base, path, **kwargs):
            if path == '/api/ready':
                return 503, headers(), b'{"status":"not ready","db":"down"}'
            return self.response(base, path, **kwargs)
        with patch.object(smoke, 'request', side_effect=down), patch.object(smoke.time, 'sleep'):
            with self.assertRaisesRegex(RuntimeError, '/api/ready'):
                smoke.check('https://demo.test')

    @patch.dict('os.environ', {}, clear=True)
    def test_open_api_without_login_fails(self):
        def open_api(base, path, **kwargs):
            if path == '/api/slots/bookable':
                return 200, headers(), b'[]'
            return self.response(base, path, **kwargs)
        with patch.object(smoke, 'request', side_effect=open_api), patch.object(smoke.time, 'sleep'):
            with self.assertRaisesRegex(RuntimeError, '/api/slots/bookable'):
                smoke.check('https://demo.test')

    @patch.dict('os.environ', CREDS, clear=True)
    def test_student_login_sees_slots_and_logs_out_with_cookie(self):
        with patch.object(smoke, 'request', side_effect=self.response) as req:
            smoke.check('https://demo.test')
            last = req.call_args
            self.assertEqual(last.args[1], '/api/auth/logout')
            self.assertEqual(last.kwargs['cookie'], 'test-session')

    @patch.dict('os.environ', CREDS, clear=True)
    def test_empty_slot_list_after_login_fails(self):
        def empty(base, path, data=None, cookie=None):
            if path == '/api/slots/bookable' and cookie:
                return 200, headers(), b'[]'
            return self.response(base, path, data, cookie)
        with patch.object(smoke, 'request', side_effect=empty):
            with self.assertRaisesRegex(RuntimeError, 'Login smoke'):
                smoke.check('https://demo.test')

    @patch.dict('os.environ', CREDS, clear=True)
    def test_session_is_logged_out_even_if_me_fails(self):
        def broken_me(base, path, data=None, cookie=None):
            if path == '/api/auth/me':
                return 500, headers(), b'{}'
            return self.response(base, path, data, cookie)
        with patch.object(smoke, 'request', side_effect=broken_me) as req:
            with self.assertRaisesRegex(RuntimeError, 'Login smoke'):
                smoke.check('https://demo.test')
            self.assertEqual(req.call_args.args[1], '/api/auth/logout')

    @patch.dict('os.environ', {'SMOKE_EMAIL': 'student1@example.test'}, clear=True)
    def test_only_one_credential_is_an_error(self):
        with patch.object(smoke, 'request', side_effect=self.response):
            with self.assertRaisesRegex(RuntimeError, 'both'):
                smoke.check('https://demo.test')


if __name__ == '__main__':
    unittest.main()
