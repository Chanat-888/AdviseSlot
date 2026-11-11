// Synthetic demo accounts (A-05). No real people.
// The demo password is not in the code: seed.ts reads it from SEED_DEMO_PASSWORD.

// bcrypt cost factor (NFR-01).
export const BCRYPT_COST = 12;

// Emails are lowercase (D-26); the database rejects anything else once F-01 adds its CHECK.
export const SEED_USERS = [
  { name: "Advisor One", email: "advisor1@example.test", role: "ADVISOR" },
  { name: "Advisor Two", email: "advisor2@example.test", role: "ADVISOR" },
  { name: "Student One", email: "student1@example.test", role: "STUDENT" },
  { name: "Student Two", email: "student2@example.test", role: "STUDENT" },
  { name: "Student Three", email: "student3@example.test", role: "STUDENT" },
] as const;

// F-04 section 6: demo slots on the next DEMO_SLOT_DAYS weekdays, starting DEMO_SLOT_LEAD_DAYS
// calendar days after today (Asia/Bangkok), so morning slots are never late when seeded.
export const DEMO_SLOT_DAYS = 3;
export const DEMO_SLOT_LEAD_DAYS = 2;
export const DEMO_SLOT_TIMES: Record<string, string[]> = {
  "advisor1@example.test": ["09:00", "09:30", "14:00"],
  "advisor2@example.test": ["10:00", "13:30"],
};

// F-07 section 6: demo bookings, student email -> advisor email. Student One has none on purpose.
export const DEMO_BOOKINGS: Record<string, string> = {
  "student2@example.test": "advisor1@example.test",
  "student3@example.test": "advisor2@example.test",
};
