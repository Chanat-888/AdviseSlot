# AdviseSlot final UAT re-test on `v1.0.0-rc` (Final Delivery S6)

Product Team: Duo Gang — Chanat Dachkhumhang (67070503409), Jeerasak Phisawong (67070503461)
UAT Team: Team Top 2 (Lab 6 testers): Grittapob Chutitas (67070503402), Moe Thauk Ko (67070503483), if they agree. Any tester outside the Product Team may run it.
Theme: 1 Appointment & Scheduling — student office-hour advising.

## Version history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-27 | Jeerasak (drafted with an AI agent) | First version: Lab 6 cases UAT-01 to UAT-05 updated for BR-07 (D-31, Lab 7), new cases UAT-06 to UAT-10 for Sprint 2 and 3. |
| 0.2 | 2026-11-27 | Jeerasak (drafted with an AI agent) | Review of PR #127 and findings #129 (Team Top 2): UAT-02 step 4, UAT-03 step 6 and UAT-07 step 5 now expect what the app does; section 2 notes the sheet assumes a fresh seed; section 5 lists the 2-booking limit and the booked-slot delete as covered by automated tests. |

## 1. Release under test

| Item | Value |
|---|---|
| Repository | https://github.com/Chanat-888/AdviseSlot |
| Tested release (deployed) | `main` at `f567fb76e4f40c049ab49090a7ce8f0f41eb3bc1`, tag `v1.0.0-rc` (release PR #122, Issue #118) |
| Cloud Run revision | `adviseslot-00008-8cj` |
| URL | https://adviseslot-nfnam6jppq-as.a.run.app |
| How to confirm the version | The page footer shows `f567fb7`, or open `/api/version` → `{"commit":"f567fb7…"}`. If it shows another commit, stop and tell the Product Team. |
| Scope | All features F-01 to F-19 (Sprint 1, 2 and 3). |

**What changed since Lab 6 (`c4dc3b4`):** Sprint 2: student cancel (F-10), advisor cancel with a reason (F-11), edit slot (F-12), delete slot (F-13), reschedule (F-14), create several slots (F-15), and the new booking limit (Lab 7, D-31): **at most two upcoming bookings, and at most one with the same advisor**. Sprint 3: filter bookable slots (F-16), appointment summary (F-17), cancellation history (F-18), late-slot notifications (F-19).

**Change notice:** the Product Team does not deploy during the agreed test window without telling the UAT Team first. Acceptance applies only to the commit above.

## 2. Accounts and data

All data is synthetic. The shared demo password is sent privately; it is not in this document or in Git.

| Label | Email (login) | Role |
|---|---|---|
| ADV1 | advisor1@example.test | Advisor ("Advisor One") |
| ADV2 | advisor2@example.test | Advisor ("Advisor Two") |
| STU1 | student1@example.test | Student ("Student One") |
| STU2 | student2@example.test | Student ("Student Two") |
| STU3 | student3@example.test | Student ("Student Three") |

**Fresh data before the session:** on the morning of the test, the Product Team runs the `adviseslot-migrate` Cloud Run job (migrate + seed). The seed adds slots on the 3 weekdays starting 2 days later (ADV1 09:00, 09:30, 14:00; ADV2 10:00, 13:30) and gives STU2 one upcoming booking with Advisor One and STU3 one with Advisor Two. Then the Product Team checks that STU1 has **no** upcoming booking (cancel it in the app if needed).

The cases assume this fresh seed. Without it, the seeded STU2 and STU3 bookings may already be in the past on the test day, so the Upcoming lists in UAT-02 and UAT-03 differ from the expected results.

Date notation: **D** = the first weekday (Mon–Fri) that is at least 2 days after the test day. **D+1** = the next weekday after D. Write the actual dates in the result.

Times are Asia/Bangkok. Use two browsers (or one normal and one private window) when a case needs two users at once.

**Order:** UAT-01 → UAT-04 → UAT-06, and UAT-07 → UAT-09 (they build on each other). UAT-02, UAT-03, UAT-05 and UAT-08 can run any time. UAT-10 needs a set time (see the case).

**Undo:** unlike Lab 6, testers can undo their own bookings in the app (Cancel booking), so no database reset is needed between cases.

## 3. Cases from Lab 6 (re-run, updated)

### UAT-01 Normal journey: advisor publishes a slot, student books it, both see it (unchanged)
- **Refs:** F-04 AC-F04-01; F-06 AC-F06-01; F-07 AC-F07-01; F-08 AC-F08-01; F-09 AC-F09-01, AC-F09-02
- **Roles:** ADV1, STU1
- **Preconditions:** STU1 has no upcoming booking. ADV1 has no slot at 11:00 on D.

| # | Action | Expected result |
|---|---|---|
| 1 | Log in as ADV1. | Navbar shows "Advisor One (ADVISOR)" and **Schedule**, **History**, **Summary**. |
| 2 | Open **Schedule**. Under "Create a slot" keep **One slot**, choose Date = D, Start time = 11:00, click **Create**. | Green alert "Slot created: <D>, 11:00-11:30." The list for D shows **11:00-11:30** **Open**. |
| 3 | Click **Logout**. Log in as STU1 in the same tab (no reload). | Navbar shows "Student One (STUDENT)" with **Slots**, **My bookings**, **Notifications**. Logout is clickable (the Lab 6 defect #58). |
| 4 | Open **Slots**. Find D, 11:00-11:30, Advisor One. | Row is listed with "Book by <day before D>, 18:00". No student name appears on any row. |
| 5 | Click **Book** on that row. | "Booking confirmed.", When = D 11:00-11:30, Advisor One, Student One, Status = Upcoming. |
| 6 | Open **My bookings**. | Under Upcoming: D 11:00-11:30 with Advisor One. |
| 7 | Logout. Log in as ADV1, open **Schedule**. | D 11:00-11:30 shows **Booked** and a link "Student One". |
| 8 | Click "Student One". Note the URL `/bookings/<id>`. | Same booking detail as step 5. |

### UAT-02 Business rules: booking limit (changed), overlapping and past slots
- **Refs:** BR-07 as changed by Lab 7 (D-31): F-07 `SAME_ADVISOR_BOOKING`, `ACTIVE_BOOKING_LIMIT`; F-04 AC-F04-03, AC-F04-04; F-10 (to undo)
- **Roles:** STU2, ADV2
- **Preconditions:** seeded data (STU2 has 1 upcoming booking with Advisor One).

| # | Action | Expected result |
|---|---|---|
| 1 | Log in as STU2. Open **My bookings**, write down the Upcoming list. | 1 upcoming booking with Advisor One. |
| 2 | Open **Slots**, choose Advisor = Advisor One, click **Book** on any row. | Red alert "You already have an upcoming booking with this advisor." |
| 3 | Choose Advisor = Advisor Two, click **Book** on any row. | "Booking confirmed." (second booking, other advisor). |
| 4 | Open **Slots**, clear the filters, click **Book** on any other row. | Red alert "You already have an upcoming booking with this advisor." No third booking. (Every slot belongs to Advisor One or Two, and the same-advisor check runs first, so the 2-booking message can't be reached in the UI; see section 5.) |
| 5 | Open **My bookings**. | Exactly 2 Upcoming: the one from step 1 and the one from step 3. |
| 6 | Open the step-3 booking, click **Cancel booking**, then **Yes**. | "Booking cancelled." My bookings shows it under Cancelled with "Cancelled by you". Upcoming is back to the step-1 list. |
| 7 | Logout. Log in as ADV2, open **Schedule**. Under "Create a slot" choose Date = D, Start time = 10:00, click **Create**. | Red alert "This slot overlaps one of your slots." |
| 8 | Create a slot with Date = the most recent past weekday, Start time = 10:00. | Red alert "This start time is in the past." |
| 9 | Reload **Schedule**. | No new slot on D at 10:00 and no past slot. |

### UAT-03 Forbidden access: other users' bookings and the wrong role (extended)
- **Refs:** F-09 AC-F09-03; F-04 AC-F04-05; F-05 AC-F05-02; F-06 AC-F06-04; F-17, F-18, F-19 role checks
- **Roles:** STU3, ADV2, STU2
- **Preconditions:** get STU2's booking URL: log in as STU2, **My bookings**, open the Upcoming booking, copy `/bookings/<id>`.

| # | Action | Expected result |
|---|---|---|
| 1 | Log in as STU3. Paste STU2's booking URL. | "Booking not found." No data of STU2's booking. |
| 2 | As STU3, open `<URL>/bookings/999999`. | Same "Booking not found." |
| 3 | As STU3, open `<URL>/schedule`. | "Only advisors can view their schedule." No slot list. |
| 4 | As STU3, open `<URL>/summary` and `<URL>/history`. | "Only advisors have an appointment summary." and "Only advisors have a booking history." No data. |
| 5 | Logout. Log in as ADV2 (not the slot's advisor). Open STU2's booking URL. | "Booking not found." |
| 6 | As ADV2, open `<URL>/slots` and `<URL>/notifications`. | "Only students can list advisors." (no slot data shown) and "Only students have notifications." |
| 7 | Logout. Log in as STU2, open the booking. | Unchanged (same When, Advisor One, Upcoming). |

### UAT-04 Persistence and session (unchanged)
- **Refs:** F-02 AC-F02-01; F-03 AC-F03-01; F-05 AC-F05-01; F-06 AC-F06-02; F-08 AC-F08-01
- **Roles:** STU1, STU3, ADV1
- **Preconditions:** UAT-01 passed.

| # | Action | Expected result |
|---|---|---|
| 1 | Log in as STU1 in a fresh browser window. Open **My bookings**. | D 11:00-11:30 with Advisor One, Upcoming. |
| 2 | Click **Logout**. Press **Back**, then reload. | Login page; no booking data visible. |
| 3 | Log in as STU3, open **Slots**. | D 11:00 with Advisor One is **not** listed. Other Open slots are. |
| 4 | Logout. Log in as ADV1, open **Schedule**. | D 11:00-11:30 **Booked** by Student One. |

### UAT-05 Login rejection (unchanged)
- **Refs:** F-01 AC-F01-02, AC-F01-05

| # | Action | Expected result |
|---|---|---|
| 1 | Log in with `student1@example.test` and `wrong-password-123`. | "Invalid email or password." Still on the login page. |
| 2 | Log in with `nobody@example.test` and `wrong-password-123`. | Exactly the same message. |
| 3 | Leave both fields empty, click **Log in**. | "Email is required." and "Password is required." |
| 4 | Open `<URL>/bookings` while logged out. | Redirected to the login page. |

## 4. New cases for Sprint 2 and 3

### UAT-06 Student reschedules, then cancels (F-14, F-10, F-18)
- **Refs:** F-14 (BR-15); F-10 (BR-11); F-18 AC-F18-06
- **Roles:** STU1, ADV1
- **Preconditions:** UAT-04 done (STU1 holds D 11:00 with Advisor One).

| # | Action | Expected result |
|---|---|---|
| 1 | Log in as STU1. **My bookings** → open the D 11:00 booking → **Reschedule**. | Slots page with a blue note "Choose a new time for your booking on <D>, 11:00." Each row has **Move here**. |
| 2 | Click **Move here** on Advisor One, D 14:00. | "Booking moved." When = D 14:00-14:30, Upcoming. |
| 3 | Open **My bookings**. | Upcoming: D 14:00 with Advisor One. Cancelled: D 11:00 with "Cancelled by you" (a reschedule is a cancel plus a new booking). |
| 4 | Open the D 14:00 booking → **Cancel booking** → **No**. | Nothing changes; still Upcoming. |
| 5 | **Cancel booking** → **Yes**. | "Booking cancelled." My bookings shows it under Cancelled, "Cancelled by you". |
| 6 | Open **Slots**. | D 11:00 and D 14:00 with Advisor One are offered again (cancel frees the slot). |

### UAT-07 Advisor manages slots and cancels with a reason (F-15, F-12, F-13, F-11)
- **Refs:** F-15 (D-30); F-12 (D-28); F-13 (D-29); F-11
- **Roles:** ADV1, STU3
- **Preconditions:** ADV1 has no slots on D+1 between 15:00 and 16:00.

| # | Action | Expected result |
|---|---|---|
| 1 | Log in as ADV1, **Schedule** → **Several slots**: Date = D+1, From 15:00, To 16:00, **Create**. | "2 slots created." D+1 shows 15:00-15:30 and 15:30-16:00, Open. |
| 2 | Click **Edit** on D+1 15:30, change the start time to 16:30, **Save**. | "Slot updated: <D+1>, 16:30-17:00." |
| 3 | Click **Delete** on D+1 16:30, then confirm **Delete**. | "Slot deleted." The row is gone after a reload. |
| 4 | Logout. Log in as STU3, book D+1 15:00 with Advisor One. | "Booking confirmed." |
| 5 | Logout. Log in as ADV1, open **Schedule**, look at D+1 15:00 (now Booked). | The Booked row shows no **Edit** or **Delete** button, only the "Student Three" link. The slot stays. |
| 6 | Click "Student Three" on D+1 15:00 → **Cancel booking**, leave the reason empty (or only spaces). | **Confirm** stays disabled; the booking stays Upcoming (the reason is required, BR-12). |
| 7 | Type the reason "UAT: advisor away", **Confirm**. | "Booking cancelled." The reason is shown. |
| 8 | Logout. Log in as STU3, **My bookings**. | D+1 15:00 under Cancelled with "Cancelled by Advisor One: UAT: advisor away". |

### UAT-08 Student filters bookable slots (F-16)
- **Refs:** F-16 AC-F16-01 to AC-F16-05
- **Roles:** STU1

| # | Action | Expected result |
|---|---|---|
| 1 | Log in as STU1, open **Slots**. | Advisor and Date filters above the list; slots of both advisors. |
| 2 | Choose Advisor = Advisor Two. | Only Advisor Two rows. The URL has `?advisor=`. "Clear filters" shows. |
| 3 | Also choose Date = D. | Only Advisor Two slots on D. |
| 4 | Reload the page. | Same filters and the same rows (filters are kept in the URL). |
| 5 | Choose a weekend date. | "No bookable slots match these filters." with a **Clear filters** link. |
| 6 | Click **Clear filters**. | The full list again. |

### UAT-09 Advisor summary and history (F-17, F-18)
- **Refs:** F-17 AC-F17-01 to AC-F17-05 (D-33); F-18 AC-F18-01 to AC-F18-05
- **Roles:** ADV1
- **Preconditions:** UAT-06 and UAT-07 done.

| # | Action | Expected result |
|---|---|---|
| 1 | Log in as ADV1, click **Summary**. | From = today, To = today + 6. Four numbers: Slots, Booked, Cancelled, Open, and an Upcoming list. |
| 2 | Set From = D, To = D+1. Write down the four numbers. | Cancelled is at least 3 (the two UAT-06 cancels on D and the UAT-07 cancel on D+1). The slot deleted in UAT-07 is not counted in Slots. Upcoming lists only bookings in that range. |
| 3 | Set To earlier than From. | Red alert "to must be on or after from." |
| 4 | Click **History**. | Rows newest first with Student, Status and Cancellation: the UAT-06 rows "Cancelled by Student One" and the UAT-07 row "Cancelled by you: UAT: advisor away". |
| 5 | Click a date in History. | The booking detail opens. |

### UAT-10 Late-slot notification (F-19) — needs a set time
- **Refs:** F-19 AC-F19-01, AC-F19-05, AC-F19-06; BR-16
- **Roles:** ADV2, STU1
- **When:** a "late slot" is a morning slot created after 18:00 the day before, and at least 2 hours before it starts. Run this case **after 18:00 on the evening before a weekday** (or on that weekday morning before 09:00), for an 11:00 slot on that **weekday morning**. At other times the app correctly refuses or makes a normal slot; then record **BLOCKED (time)**, not FAIL.

| # | Action | Expected result |
|---|---|---|
| 1 | In that window, log in as ADV2, create one slot for that weekday at 11:00. | "Slot created …". The row shows a yellow **Late slot** badge. |
| 2 | Logout. Log in as STU1. | The **Notifications** link shows a badge with the unread count (at least 1). |
| 3 | Open **Notifications**. | Newest first, in bold (unread): "Late slot: Advisor Two", the date and 11:00-11:30, a **Book** link, and **Mark as read**. |
| 4 | Click **Mark as read**. | The row is no longer bold, **Mark as read** disappears, and the badge count goes down by 1. |
| 5 | Logout. Log in as ADV2, delete the slot. Log in as STU1, open **Notifications**. | The notification stays, but shows "This slot is no longer available." instead of **Book**. |

## 5. Coverage

| Required category | Cases |
|---|---|
| Normal journeys | UAT-01, UAT-06, UAT-07, UAT-08, UAT-09 |
| Business rules / boundaries | UAT-02 (BR-07 as changed, overlap, past), UAT-06 (reschedule), UAT-07 (booked slot, reason) |
| Forbidden role / ownership | UAT-03 |
| State / history / persistence | UAT-04, UAT-06, UAT-09 |
| Notifications | UAT-10 |
| Extra | UAT-05 (authentication) |

Not covered manually (time-dependent, covered by automated tests at `f567fb7`): the 2-hour session expiry, booking deadlines at 18:00 / 2 h, the 12-hour student cancel limit (BR-11), and concurrent bookings. Also not reachable in the UI, covered by automated tests: the 2-upcoming-bookings limit (`ACTIVE_BOOKING_LIMIT`, `bookings.create.test.ts`) and deleting a booked slot (409, `slots.delete.test.ts`).

## 6. Result sheet (UAT Team fills)

| Case | Tester (name, team) | Date/time | Tested commit | Inputs used (D = ?, D+1 = ?) | Actual result (own words) | PASS / FAIL / BLOCKED | Evidence ID |
|---|---|---|---|---|---|---|---|
| UAT-01 | | | | | | | |
| UAT-02 | | | | | | | |
| UAT-03 | | | | | | | |
| UAT-04 | | | | | | | |
| UAT-05 | | | | | | | |
| UAT-06 | | | | | | | |
| UAT-07 | | | | | | | |
| UAT-08 | | | | | | | |
| UAT-09 | | | | | | | |
| UAT-10 | | | | | | | |

Report findings as a GitHub Issue on https://github.com/Chanat-888/AdviseSlot/issues with: case ID, tested commit, steps, expected, actual, severity, screenshot.

**Final decision (UAT Team records it, e.g. as a comment on #118):** Accepted / Accepted with conditions / Not accepted, with the commit tested. Only the UAT Team may record acceptance.
