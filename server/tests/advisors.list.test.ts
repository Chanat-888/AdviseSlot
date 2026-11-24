import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { createStudents, createUsers, loginCookie, resetUsers, type Fixture } from "./helpers.js";

// F-16 Filter bookable slots, TEST-F16-06 (AC-F16-06) from
// docs/sprints/sprint-3/F-16-filter-bookable-slots.md (v0.2, section 8): the advisor list for the
// filter's select (GET /api/advisors), and 403 for an advisor on both F-16 endpoints.

let student: Fixture;
let advisor: Fixture;

beforeAll(async () => {
  ({ student, advisor } = await createUsers()); // Student One, Dr. Advisor One, Dr. Advisor Two
  await prisma.user.create({ data: { name: "Zed Advisor", email: "zed@example.test", passwordHash: "x", role: "ADVISOR" } });
  await prisma.user.create({ data: { name: "Amy Advisor", email: "amy@example.test", passwordHash: "x", role: "ADVISOR" } });
  await createStudents(1, "second");
}, 30_000);

afterAll(async () => {
  await resetUsers();
  await prisma.$disconnect();
});

describe("TEST-F16-06 (AC-F16-06): advisor list for students; advisors get 403", () => {
  it("gives a student every advisor as { id, name }, sorted by name, with no students", async () => {
    const res = await request(app).get("/api/advisors").set("Cookie", await loginCookie(student.email));
    expect(res.status).toBe(200);
    expect(res.body.map((a: { name: string }) => a.name)).toEqual([
      "Amy Advisor",
      "Dr. Advisor One",
      "Dr. Advisor Two",
      "Zed Advisor",
    ]);
    for (const item of res.body) expect(Object.keys(item).sort()).toEqual(["id", "name"]);
    const ids = (await prisma.user.findMany({ where: { role: "ADVISOR" }, select: { id: true } })).map((u) => u.id);
    expect(res.body.map((a: { id: number }) => a.id).sort()).toEqual(ids.sort());
    expect(res.text).not.toContain("@example.test");
  });

  it("refuses an advisor on both F-16 endpoints with 403 FORBIDDEN_ROLE", async () => {
    const a = await loginCookie(advisor.email);

    const list = await request(app).get("/api/advisors").set("Cookie", a);
    expect(list.status).toBe(403);
    expect(list.body).toEqual({ error: { code: "FORBIDDEN_ROLE", message: "Only students can list advisors." } });

    const slots = await request(app).get(`/api/slots/bookable?advisorId=${advisor.id}`).set("Cookie", a);
    expect(slots.status).toBe(403);
    expect(slots.body).toEqual({ error: { code: "FORBIDDEN_ROLE", message: "Only students can view bookable slots." } });
  });
});
