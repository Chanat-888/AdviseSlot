# AdviseSlot Sprint 1 UAT plan and handoff (Lab 6 Part A)

Product Team: Duo Gang — Chanat Dachkhumhang (67070503409), Jeerasak Phisawong (67070503461)
UAT Team: Team Top 2: Grittapob Chutitas (67070503402), Moe Thauk Ko (67070503483)
Theme: 1 Appointment & Scheduling — student office-hour advising.

## 1. Release under test

| Item | Value |
|---|---|
| Repository | https://github.com/Chanat-888/AdviseSlot |
| Sprint 1 baseline tag | `v0.1.0-sprint-1` (commit `6718744`) |
| Tested release (deployed) | `main` at `cbcb783d6ed2ef45f84befae9976137a42319b91` (Lab 5 release), tag `v0.1.1-uat` |
| Cloud Run revision | _fill from Console before handoff_ |
| URL | https://adviseslot-nfnam6jppq-as.a.run.app |
| How to confirm the version | The page footer shows the commit, or open `/api/version` → `{"commit":"cbcb783d…"}`. If it shows another commit, stop and tell the Product Team. |
| Difference from the tag | Only Lab 5 deployment changes (cloud config, CI, version footer). No Sprint 2/3 features. |

**Accepted-for-test scope:** Sprint 1 features F-01 to F-09 only (log in, log out, current user,
create slot, view own slots, view bookable slots, book slot, view own bookings, booking detail).
**Out of scope:** cancel/reschedule, notifications, history views (Sprint 2/3). Missing Sprint 2/3
features are not defects.

**Known issue in this release:** #58, Logout stays disabled after a second login in the same
tab (found by the Product Team before handoff, Major, fix in PR #59, not deployed yet). It hits
UAT-01 step 7 (UAT-04 is not affected: its step 2 reloads the page). Please record what you see (FAIL, linked to #58; no new Issue
needed), then reload the page, click **Logout** and continue the case, so the later steps still
get tested. The fixed release will be retested with these steps.

**Change notice:** the Product Team will not deploy during the agreed UAT window without telling
the UAT Team first. Acceptance applies only to the commit recorded above.

## 2. Accounts and data

All data is synthetic. Passwords are sent privately (one shared demo password for all accounts);
they are not in this document or in Git.

| Label | Email (login) | Role | Seeded state |
|---|---|---|---|
| ADV1 | advisor1@example.test | Advisor ("Advisor One") | Slots 09:00, 09:30, 14:00 on the 3 weekdays starting 2 days after seeding |
| ADV2 | advisor2@example.test | Advisor ("Advisor Two") | Slots 10:00, 13:30 on the same days |
| STU1 | student1@example.test | Student ("Student One") | **No booking** (kept free for UAT-01) |
| STU2 | student2@example.test | Student ("Student Two") | 1 upcoming booking with Advisor One |
| STU3 | student3@example.test | Student ("Student Three") | 1 upcoming booking with Advisor Two |

Times are Asia/Bangkok. Use two different browsers (or one normal + one private window) when a
case needs two users at once.

**Sequence:** UAT-02, UAT-03 and UAT-05 change no data and can run any time, in any order.
UAT-01 changes data (creates 1 slot and 1 booking) and must run once, **before UAT-04**.

**Fresh data before each session:** the seed places its slots relative to the day it runs (3
weekdays starting 2 days later) and books STU2 and STU3 only when they have no upcoming booking.
So on the morning of each UAT session (the same day as testing) the Product Team runs the
`adviseslot-migrate` Cloud Run job (migrate + seed) and checks that STU2 and STU3 each show
1 upcoming booking. Older seeded slots and bookings that are already past are not used by any case.

**Reset / cleanup:** Sprint 1 has no cancel feature, so a UAT-01 booking cannot be undone in the
app. If UAT-01 must be repeated (e.g. retest), ask the Product Team; it deletes STU1's booking
and the slot ADV1 created in UAT-01 from the database, re-runs the seed job, and replies when
done. Do not create extra slots or bookings beyond the steps.

## 3. Cases

Date notation: **D** = the first weekday (Mon–Fri) that is at least 2 days after the test day.
Write the actual date of D in the result.

### UAT-01 Normal journey: advisor publishes a slot, student books it, both see it
- **Refs:** F-04 AC-F04-01; F-06 AC-F06-01; F-07 AC-F07-01; F-08 AC-F08-01; F-09 AC-F09-01, AC-F09-02
- **Purpose:** the main Sprint 1 journey works end to end on the deployed release.
- **Roles:** ADV1, STU1
- **Preconditions:** STU1 has no upcoming booking. ADV1 has no slot at 11:00 on D.
- **Inputs:** Date = D, Start time = 11:00

| # | Action | Expected result |
|---|---|---|
| 1 | Log in as ADV1. | Navbar shows "Advisor One (ADVISOR)" and a **Schedule** link. |
| 2 | Open **Schedule**. Under "Create a slot" choose Date = D, Start time = 11:00, click **Create**. | Green alert "Slot created: <D>, 11:00-11:30." The list for D shows **11:00-11:30** with status **Open**. |
| 3 | Click **Logout**. Log in as STU1. | Navbar shows "Student One (STUDENT)" with **Slots** and **My bookings**. |
| 4 | Open **Slots**. Find D, 11:00-11:30, Advisor One. | Row is listed with "Book by <day before D>, 18:00". No student name appears on any row. |
| 5 | Click **Book** on that row. | Booking page opens with "Booking confirmed.", When = D 11:00-11:30, Advisor = Advisor One, Student = Student One, Status = Upcoming. |
| 6 | Open **My bookings**. | Exactly one booking: D 11:00-11:30 with Advisor One, Upcoming. |
| 7 | Logout. Log in as ADV1, open **Schedule**. | D 11:00-11:30 now shows **Booked** and a link "Student One". |
| 8 | Click "Student One". Note the URL `/bookings/<id>` (needed for UAT-03). | Same booking detail as step 5 (When, Advisor One, Student One, Upcoming). |

### UAT-02 Business rules: one active booking per student, no overlapping or past slots
- **Refs:** F-07 AC-F07-06; F-04 AC-F04-03, AC-F04-04
- **Purpose:** the server rejects rule-breaking requests and stores nothing.
- **Roles:** STU2, ADV2
- **Preconditions:** seeded data (STU2 has 1 upcoming booking; ADV2 has a 10:00 slot on D).
- **Inputs:** any Open slot; D 10:00; yesterday's date (a weekday) 10:00

| # | Action | Expected result |
|---|---|---|
| 1 | Log in as STU2. Open **My bookings**, write down the bookings shown. | 1 upcoming booking with Advisor One. |
| 2 | Open **Slots**, click **Book** on any listed slot. Write which slot. | Red alert "You already have an upcoming booking." |
| 3 | Open **My bookings** again. | Same list as step 1 — no new booking. |
| 4 | Logout. Log in as ADV2, open **Schedule**, count the slots on D. | D shows 10:00-10:30 **Booked** (Student Three) and 13:30-14:00 **Open**. |
| 5 | Create a slot with Date = D, Start time = 10:00. | Red alert "This slot overlaps one of your slots." The form keeps its values. |
| 6 | Create a slot with Date = the most recent past weekday, Start time = 10:00. | Red alert "This start time is in the past." |
| 7 | Reload **Schedule**. | Slot list for D is unchanged from step 4; no past slot was added. |

### UAT-03 Forbidden access: other users' bookings and the wrong role
- **Refs:** F-09 AC-F09-03; F-04 AC-F04-05; F-05 AC-F05-02; F-06 AC-F06-04; F-07 AC-F07-07
- **Purpose:** a user cannot see another user's booking or use the other role's screens; nothing is disclosed.
- **Roles:** STU3, ADV2, STU2
- **Preconditions:** STU2's seeded booking exists (with Advisor One). Get its id: log in as STU2, **My bookings**, open the booking, copy the URL `/bookings/<id>`.
- **Inputs:** `<URL>/bookings/<STU2 booking id>`; `<URL>/bookings/999999`

| # | Action | Expected result |
|---|---|---|
| 1 | Log in as STU3. Paste STU2's booking URL in the address bar. | Red alert "Booking not found." No date, advisor or student name of STU2's booking is shown. |
| 2 | As STU3, open `<URL>/bookings/999999`. | Same message "Booking not found." (cannot tell "exists" from "does not exist"). |
| 3 | As STU3, type `<URL>/schedule`. | Red alert "Only advisors can view their schedule." No slot list is shown. (The empty create form is visible; filling it and clicking **Create** shows "Only advisors can create slots." and creates nothing.) |
| 4 | Logout. Log in as ADV2 (not the slot's advisor). Open STU2's booking URL. | "Booking not found." No booking data shown. |
| 5 | As ADV2, type `<URL>/slots`. | Red alert "Only students can view bookable slots." No slot list. |
| 6 | Logout. Log in as STU2, open **My bookings** and the booking. | Booking is unchanged (same When, Advisor One, Upcoming). |

### UAT-04 Persistence and session: data survives logout, old session is ended
- **Refs:** F-02 AC-F02-01; F-03 AC-F03-01; F-05 AC-F05-01; F-06 AC-F06-02; F-08 AC-F08-01
- **Purpose:** the UAT-01 booking is stored on the server, the booked slot is no longer offered, and logout really ends the session.
- **Roles:** STU1, STU3, ADV1
- **Preconditions:** UAT-01 passed (STU1 booked D 11:00 with Advisor One).

| # | Action | Expected result |
|---|---|---|
| 1 | Log in as STU1 in a fresh browser window. Open **My bookings**. | D 11:00-11:30 with Advisor One, Upcoming — same as UAT-01 step 6. |
| 2 | Click **Logout**. Press the browser **Back** button, then reload. | Login page is shown; no booking data is visible. |
| 3 | Log in as STU3, open **Slots**. | D 11:00 with Advisor One is **not** listed (booked). Other Open slots still are. |
| 4 | Logout. Log in as ADV1, open **Schedule**. | D 11:00-11:30 is **Booked** by Student One; the other ADV1 slots keep their status. |

### UAT-05 Login rejection (supporting case)
- **Refs:** F-01 AC-F01-02, AC-F01-05
- **Purpose:** wrong credentials give one generic message and no access.
- **Roles:** none (logged out)
- **Inputs:** `student1@example.test` + `wrong-password-123`; `nobody@example.test` + `wrong-password-123`; empty fields

| # | Action | Expected result |
|---|---|---|
| 1 | Log in with STU1's email and a wrong password. | "Invalid email or password." Still on the login page. |
| 2 | Log in with `nobody@example.test` and the same wrong password (the password field is cleared after step 1; type it again). | Exactly the same message as step 1. |
| 3 | Leave both fields empty, click log in. | "Email is required." and "Password is required." under the fields. |
| 4 | Type `<URL>/bookings` in the address bar. | Redirected to the login page. |

## 4. Coverage

| Required category | Case |
|---|---|
| Normal domain journey | UAT-01 |
| Business rule / boundary | UAT-02 |
| Forbidden role / ownership | UAT-03 |
| State / history / persistence | UAT-04 |
| Extra | UAT-05 (authentication) |

Not covered manually (time-dependent; covered by automated tests at the release commit): the
2-hour session expiry (AC-F01-04), booking-deadline boundaries at 18:00 / 2 h (AC-F04-06/07,
AC-F05-03, AC-F06-02, AC-F07-04/05), and 10 concurrent bookings (AC-F07-03).

## 5. Result sheet (UAT Team fills)

| Case | Tester (name, team) | Date/time | Tested commit | Inputs used (D = ?) | Actual result (own words) | PASS / FAIL / BLOCKED | Evidence ID |
|---|---|---|---|---|---|---|---|
| UAT-01 | | | | | | | |
| UAT-02 | | | | | | | |
| UAT-03 | | | | | | | |
| UAT-04 | | | | | | | |
| UAT-05 | | | | | | | |

Report findings as a GitHub Issue on https://github.com/Chanat-888/AdviseSlot/issues with:
case ID, tested commit, steps, expected, actual, severity, screenshot.
