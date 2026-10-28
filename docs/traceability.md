# AdviseSlot: Requirements Traceability

| Item | Value |
|---|---|
| Course | CPE 334, Semester 1/2026, Group Project |
| Owner of this document | Chanat Dachkhumhang (reviewer: Jeerasak Phisawong) |
| Related documents | `docs/srs.md` (v0.2), `docs/features.md`, `docs/decisions.md` |

## Version history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-10-28 | Chanat (drafted with an AI agent) | First matrix covering all FR, BR and NFR of SRS v0.2. Awaiting team review. |

## 1. How to read this matrix

- Feature (F-xx) and responsibility (R-xx) IDs are defined in `docs/features.md`.
- Sprint 1 rows list the planned AC and test IDs. They are elaborated in the Sprint 1
  feature contracts (Part E). `TEST-Fxx-nn` verifies `AC-Fxx-nn`.
- Sprint 2 and 3 rows already have a feature and a sprint. Their AC and tests are written
  in that sprint's contract.
- A requirement that spans sprints lists the Sprint 1 part with IDs and the later part as
  "defined in Sprint N contract".
- Status: **Planned** = AC and test IDs assigned, not yet implemented. **Allocated** =
  feature and sprint assigned, AC not yet written. Status is updated at each sprint review.

## 2. Matrix

### 2.1 Functional requirements

| Req | Feature / responsibility | Sprint | AC | Test | Status |
|---|---|---|---|---|---|
| FR-01 | F-01 Log in | 1 | AC-F01-01, AC-F01-02 | TEST-F01-01, TEST-F01-02 | Planned |
| FR-02 | F-02 Log out | 1 | AC-F02-01 | TEST-F02-01 | Planned |
| FR-03 | F-03 Current user | 1 | AC-F03-01 | TEST-F03-01 | Planned |
| FR-04 | F-04 Create slot | 1 | AC-F04-01 | TEST-F04-01 | Planned |
| FR-05 | F-05 View own slots | 1 | AC-F05-01 | TEST-F05-01 | Planned |
| FR-06 | F-06 View bookable slots | 1 | AC-F06-01 | TEST-F06-01 | Planned |
| FR-07 | F-07 Book slot | 1 | AC-F07-01 | TEST-F07-01 | Planned |
| FR-08 | F-08 View own bookings, F-09 Booking detail | 1 | AC-F08-01, AC-F09-01 | TEST-F08-01, TEST-F09-01 | Planned |
| FR-09 | F-09 Booking detail | 1 | AC-F09-02 | TEST-F09-02 | Planned |
| FR-10 | F-10 Student cancels booking | 2 | AC/test defined in Sprint 2 contract | | Allocated |
| FR-11 | F-11 Advisor cancels booking | 2 | AC/test defined in Sprint 2 contract | | Allocated |
| FR-12 | F-12 Edit slot | 2 | AC/test defined in Sprint 2 contract | | Allocated |
| FR-13 | F-13 Delete slot | 2 | AC/test defined in Sprint 2 contract | | Allocated |
| FR-14 | F-14 Reschedule booking | 2 | AC/test defined in Sprint 2 contract | | Allocated |
| FR-15 | F-15 Batch create slots | 2 | AC/test defined in Sprint 2 contract | | Allocated |
| FR-16 | F-16 Filter bookable slots | 3 | AC/test defined in Sprint 3 contract | | Allocated |
| FR-17 | F-17 Appointment summary | 3 | AC/test defined in Sprint 3 contract | | Allocated |
| FR-18 | F-18 Cancellation history | 3 | AC/test defined in Sprint 3 contract | | Allocated |
| FR-19 | F-19 Late-slot notification | 3 | AC/test defined in Sprint 3 contract | | Allocated |

### 2.2 Business rules

| Req | Feature / responsibility | Sprint | AC | Test | Status |
|---|---|---|---|---|---|
| BR-01 | F-04; later F-12, F-15 | 1; 2 | AC-F04-01; Sprint 2 part defined in Sprint 2 contract | TEST-F04-01 | Planned |
| BR-02 | F-04; later F-12, F-15 | 1; 2 | AC-F04-02; Sprint 2 part defined in Sprint 2 contract | TEST-F04-02 | Planned |
| BR-03 | F-04; later F-12, F-15 | 1; 2 | AC-F04-03; Sprint 2 part defined in Sprint 2 contract | TEST-F04-03 | Planned |
| BR-04 | F-04; later F-12, F-15 | 1; 2 | AC-F04-04; Sprint 2 part defined in Sprint 2 contract | TEST-F04-04 | Planned |
| BR-05 | F-07; later F-14 | 1; 2 | AC-F07-02, AC-F07-03; Sprint 2 part defined in Sprint 2 contract | TEST-F07-02, TEST-F07-03 | Planned |
| BR-06 | F-06, F-07; later F-14 | 1; 2 | AC-F06-02, AC-F07-04; Sprint 2 part defined in Sprint 2 contract | TEST-F06-02, TEST-F07-04 | Planned |
| BR-07 | F-07, F-08; later F-14 | 1; 2 | AC-F07-06, AC-F08-01; Sprint 2 part defined in Sprint 2 contract | TEST-F07-06, TEST-F08-01 | Planned |
| BR-08 | R-01, F-04, F-05; later F-12, F-13, F-15, F-17 | 1; 2, 3 | AC-F04-05, AC-F05-02; later parts defined in Sprint 2/3 contracts | TEST-F04-05, TEST-F05-02 | Planned |
| BR-09 | R-01, F-05, F-06, F-07, F-08, F-09; later F-18 | 1; 3 | AC-F05-01, AC-F06-03, AC-F07-07, AC-F08-01, AC-F09-03; Sprint 3 part defined in Sprint 3 contract | TEST-F05-01, TEST-F06-03, TEST-F07-07, TEST-F08-01, TEST-F09-03 | Planned |
| BR-10 | R-01, F-01, F-02 | 1 | AC-F01-04, AC-F02-01 | TEST-F01-04, TEST-F02-01 | Planned |
| BR-11 | F-10, F-14 | 2 | AC/test defined in Sprint 2 contract | | Allocated |
| BR-12 | F-11 | 2 | AC/test defined in Sprint 2 contract | | Allocated |
| BR-13 | F-10, F-11 | 2 | AC/test defined in Sprint 2 contract | | Allocated |
| BR-14 | F-12, F-13 | 2 | AC/test defined in Sprint 2 contract | | Allocated |
| BR-15 | F-14 | 2 | AC/test defined in Sprint 2 contract | | Allocated |
| BR-16 | Rule: F-04, F-06, F-07; later F-15. Notification: F-19 | 1 (rule); 2 (batch); 3 (notification) | AC-F04-06, AC-F06-02, AC-F07-05; later parts defined in Sprint 2/3 contracts | TEST-F04-06, TEST-F06-02, TEST-F07-05 | Planned |

### 2.3 Non-functional requirements

| Req | Feature / responsibility | Sprint | AC | Test | Status |
|---|---|---|---|---|---|
| NFR-01 | R-01, F-01 | 1 | AC-F01-03 | TEST-F01-03 | Planned |
| NFR-02 | R-01 (all protected endpoints) | 1; extended in 2, 3 | AC-R01-01; new endpoints defined in Sprint 2/3 contracts | TEST-R01-01 | Planned |
| NFR-03 | R-01, F-04, F-05, F-06, F-07, F-09; later F-10 to F-14, F-17, F-18 | 1; extended in 2, 3 | AC-F04-05, AC-F05-02, AC-F06-04, AC-F07-07, AC-F09-03; later parts defined in Sprint 2/3 contracts | TEST-F04-05, TEST-F05-02, TEST-F06-04, TEST-F07-07, TEST-F09-03 | Planned |
| NFR-04 | F-07 | 1 | AC-F07-03 | TEST-F07-03 | Planned |
| NFR-05 | F-04, F-06, F-07 | 1 | AC-F04-02, AC-F06-02, AC-F07-04, AC-F07-05 | TEST-F04-02, TEST-F06-02, TEST-F07-04, TEST-F07-05 | Planned |
| NFR-06 | R-04 | 1 (local); 2 (GCP) | AC-R04-01; Sprint 2 part defined in Sprint 2 contract | TEST-R04-01 (manual restart check) | Planned |
| NFR-07 | R-02 | 1; 3 | AC-R02-01, AC-R02-02; Sprint 3 part defined in Sprint 3 contract | TEST-R02-01, TEST-R02-02 (E2E) | Planned |
| NFR-08 | R-03 | 1 | AC-R03-01 | TEST-R03-01 (PR checklist and secret scan) | Planned |
| NFR-09 | R-04 | 2 | AC/test defined in Sprint 2 contract | | Allocated |
| NFR-10 | F-06, R-04 | 3 | AC/test defined in Sprint 3 contract | | Allocated |

## 3. Planned Sprint 1 acceptance criteria

One-line intent of each planned AC. Part E elaborates them with preconditions, steps and
expected results.

| AC | Intent | Covers |
|---|---|---|
| AC-F01-01 | Valid email and password create a session cookie and return name and role. | FR-01 |
| AC-F01-02 | Wrong password or unknown email returns 401 with the same generic message and no session. | FR-01, NFR-07 |
| AC-F01-03 | The seeded user's stored password is a bcrypt hash (cost 12), never the plaintext. | NFR-01 |
| AC-F01-04 | A session is rejected (401) once 2 hours have passed since login. | BR-10 |
| AC-F02-01 | After logout, a request with the old session cookie returns 401. | FR-02, BR-10 |
| AC-F03-01 | A logged-in user gets their own id, name, email and role. | FR-03 |
| AC-F04-01 | Advisor creates a slot from a start time; end is start + 30 min, and any client-sent end is ignored. | FR-04, BR-01 |
| AC-F04-02 | Saturday/Sunday, a start not on :00/:30, a start before 08:00 or an end after 18:00 is rejected. | BR-02, NFR-05 |
| AC-F04-03 | A start time in the past is rejected. | BR-03 |
| AC-F04-04 | A slot overlapping another of the advisor's own slots is rejected. | BR-04 |
| AC-F04-05 | A student creating a slot gets 403. | BR-08, NFR-03 |
| AC-F04-06 | A slot created at or after its normal BR-06 deadline is accepted (late slot). | BR-16 |
| AC-F05-01 | Advisor sees only their own slots, each with status and the student's name when booked. | FR-05, BR-09 |
| AC-F05-02 | A student requesting the advisor slot list gets 403. | BR-08, NFR-03 |
| AC-F06-01 | Student sees bookable slots of all advisors with advisor name, start, end and deadline. | FR-06 |
| AC-F06-02 | Booked slots, past slots and slots past their deadline are excluded; a late slot stays listed until 2 h before start. | BR-06, BR-16, NFR-05 |
| AC-F06-03 | The bookable-slot response contains no booker identity. | BR-09 |
| AC-F06-04 | An advisor requesting the bookable-slot list gets 403. | NFR-03 |
| AC-F07-01 | Student books a bookable slot and gets an ACTIVE booking. | FR-07 |
| AC-F07-02 | Booking an already booked slot returns 409 `SLOT_TAKEN`. | BR-05 |
| AC-F07-03 | 10 concurrent requests for one open slot create exactly 1 active booking. | BR-05, NFR-04 |
| AC-F07-04 | Deadline boundaries: morning slot 17:59 previous day accepted, 18:00 rejected; afternoon slot 2 h 01 min before accepted, exactly 2 h rejected. | BR-06, NFR-05 |
| AC-F07-05 | A late slot is bookable until 2 h before start and rejected from then on. | BR-16, NFR-05 |
| AC-F07-06 | A student with an active booking cannot book a second slot; a booking whose slot has ended does not count. | BR-07 |
| AC-F07-07 | An advisor booking gets 403; the student id is taken from the session, not the request. | BR-09, NFR-03 |
| AC-F08-01 | Student sees only their own bookings, upcoming and past; an ended ACTIVE booking shows as "Passed". | FR-08, BR-07, BR-09 |
| AC-F09-01 | The booking's student opens its detail. | FR-08 |
| AC-F09-02 | The slot's advisor opens the booking's detail. | FR-09 |
| AC-F09-03 | Another student or another advisor gets 404 with no booking data. | BR-09, NFR-03 |
| AC-R01-01 | Every protected Sprint 1 endpoint returns 401 to an unauthenticated request, with no private data. | NFR-02 |
| AC-R02-01 | Rejected requests return 4xx with `code` and `message`; no stack trace or SQL error in the body. | NFR-07 |
| AC-R02-02 | The UI shows the server's error message (E2E, for example a rejected booking). | NFR-07 |
| AC-R03-01 | No secret in Git or the client bundle; all configuration from environment variables. | NFR-08 |
| AC-R04-01 | A booking created before a server restart is still retrievable after it. | NFR-06 |

## 4. Coverage check

| Type | In SRS v0.2 | Mapped to a feature or responsibility | With Sprint 1 AC/test IDs | Allocated to Sprint 2/3 only | Uncovered |
|---|---|---|---|---|---|
| FR | 19 (FR-01 to FR-19) | 19 | 9 (FR-01 to FR-09) | 10 (FR-10 to FR-19) | 0 |
| BR | 16 (BR-01 to BR-16) | 16 | 11 (BR-01 to BR-10, BR-16 rule) | 5 (BR-11 to BR-15) | 0 |
| NFR | 10 (NFR-01 to NFR-10) | 10 | 8 (NFR-01 to NFR-08) | 2 (NFR-09, NFR-10) | 0 |
| **Total** | **45** | **45** | **28** | **17** | **0** |

Every feature F-01 to F-19 and responsibility R-01 to R-04 traces back to at least one
requirement, so no feature exists without a requirement.

## 5. Uncovered requirements

None. Every FR, BR and NFR in SRS v0.2 is mapped to a feature or responsibility and a sprint.

## 6. Approved changes (SRS v0.1 to v0.2)

Approved by the team on 2026-10-28 and recorded in `docs/decisions.md`. Questions Q-01 to Q-03 were closed by these decisions.

| Change | Decision | Effect on requirements | Effect on features |
|---|---|---|---|
| Weekdays only | D-14 | BR-02 extended; A-02 replaced | F-04, F-12, F-15 |
| Start times on :00 or :30 | D-15 | BR-02 extended | F-04, F-12, F-15 |
| Late slots allowed, bookable until 2 h before, in-app notification | D-16 | BR-16 added; BR-06 gets an exception; FR-19 added; A-03 replaced | F-04, F-06, F-07, F-15 (rule); F-19 (new, Sprint 3) |
| Ended bookings shown as "Passed", not counted toward the limit | D-17 | BR-07 extended; A-04 "Completed" renamed "Passed" | F-07, F-08 |
| Advisor cancels until the slot starts; student sees the reason | D-18 | BR-12 changed from "before the slot ends" to "until the slot starts", student sees the reason | F-11 |
| Reschedule and batch slot creation stay in scope | D-19 | FR-14, FR-15 kept | F-14, F-15 |
| Summary shows counts plus upcoming appointments | D-20 | No SRS text change in v0.2 (see finding 1) | F-17 |
| Session lasts 2 hours, no renewal | D-21 | BR-10 changed from 12 hours to 2 hours | F-01, F-02, R-01 |
| 12-hour cancel limit plus deadline rule answer "cancellation limits" | D-22 | Q-03 closed; no requirement change | none |
| Public holidays not blocked | none (team note) | A-06 added | none |

## 7. Findings for SRS owner

Items found while building the matrix. `docs/srs.md` was not edited.

1. **FR-17 vs D-20 (summary counts).** D-20 lists counts "slots, booked, cancelled, open";
   FR-17 lists "slots, booked, cancelled" and omits "open", and was not updated in v0.2. Decide whether an open count is required.
2. **BR-15 does not mention BR-07.** A reschedule moves the student's only active booking.
   BR-15 should say that BR-07 is checked after the old booking is released, otherwise a
   literal reading rejects every reschedule.
3. **BR-13 and late slots.** BR-13 frees a cancelled slot "if its deadline has not passed".
   For a late slot the effective deadline is BR-16 (2 h before start). Suggest wording
   "if its BR-06 or BR-16 deadline has not passed".
4. **NFR-07 Sprint 3 scope.** NFR-07 is allocated to Sprints 1 and 3, but the SRS does not
   say what Sprint 3 adds. Assumed here: re-verification of the error shape on Sprint 3
   endpoints and screens. Please confirm.
5. **FR-05 status "open".** A future slot whose booking deadline has passed is neither
   bookable nor booked. Clarify whether it shows as "open" or another status.
6. **Booking status names.** The SRS uses "upcoming" and "Passed"; SDS section 4.1 lists the
   student's bookings as "upcoming, completed, cancelled". Align on one set of names.
7. **SDS gaps for Sprint 3 (for the SDS owner).** SDS v0.1 has no Notification entity,
   endpoint or screen for FR-19, and no history endpoint for FR-18. Not needed for Sprint 1,
   but the SDS should cover them before Sprint 3.
8. **Minor.** In SRS section 7, A-06 is listed before A-05.
