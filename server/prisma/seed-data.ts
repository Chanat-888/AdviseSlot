// Synthetic demo accounts for local development and tests (A-05). No real people.
// The demo password is for local use only: it is listed in the README, never in the PDF.

export const DEMO_PASSWORD = "AdviseSlot-demo-2026";

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
