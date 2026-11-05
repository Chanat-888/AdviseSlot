import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/health", () => {
  it("returns 200 and reports the database as up", async () => {
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", db: "up" });
  });
});
