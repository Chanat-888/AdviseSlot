import bcrypt from "bcryptjs";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";

// Shared by the F-02 and F-03 test files. Test files run one at a time (vitest.config.ts)
// because each one empties the User table.

export const PASSWORD = "test-password-session";

export type Fixture = { id: number; name: string; email: string; role: "STUDENT" | "ADVISOR" };

export async function resetUsers() {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "User" RESTART IDENTITY CASCADE');
}

export async function createUsers(): Promise<{ student: Fixture; advisor: Fixture }> {
  await resetUsers();
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const s = await prisma.user.create({
    data: { name: "Student One", email: "student1@example.test", passwordHash, role: "STUDENT" },
  });
  const a = await prisma.user.create({
    data: { name: "Dr. Advisor One", email: "advisor1@example.test", passwordHash, role: "ADVISOR" },
  });
  return {
    student: { id: s.id, name: s.name, email: s.email, role: "STUDENT" },
    advisor: { id: a.id, name: a.name, email: a.email, role: "ADVISOR" },
  };
}

/** Logs in through the real endpoint and returns the Cookie header value ("sid=..."). */
export async function loginCookie(email: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.status}`);
  const header = (res.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
  const sid = header.find((c) => c.startsWith("sid="));
  if (!sid) throw new Error("No sid cookie after login");
  return sid.split(";")[0]!;
}
