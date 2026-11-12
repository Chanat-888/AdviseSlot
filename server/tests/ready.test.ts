import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import request from "supertest";
import { afterAll, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { serveClient } from "../src/static.js";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/ready", () => {
  it("returns 200 when the database answers", async () => {
    const res = await request(app).get("/api/ready");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ready", db: "up" });
  });

  it("returns 503 when the database is not reachable", async () => {
    const spy = vi.spyOn(prisma, "$queryRaw").mockRejectedValueOnce(new Error("down"));

    const res = await request(app).get("/api/ready");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: "not ready", db: "down" });
    spy.mockRestore();
  });
});

describe("serveClient (production static files)", () => {
  const dir = mkdtempSync(join(tmpdir(), "client-dist-"));
  writeFileSync(join(dir, "index.html"), "<html><body>spa-shell</body></html>");
  writeFileSync(join(dir, "app.js"), "console.log(1)");
  const site = express();
  site.get("/api/health", (_req, res) => res.json({ ok: true }));
  serveClient(site, dir);

  it("serves index.html at / and for client routes like /slots", async () => {
    for (const path of ["/", "/slots", "/bookings/12"]) {
      const res = await request(site).get(path);
      expect(res.status).toBe(200);
      expect(res.text).toContain("spa-shell");
    }
  });

  it("serves built assets", async () => {
    const res = await request(site).get("/app.js");
    expect(res.status).toBe(200);
    expect(res.text).toBe("console.log(1)");
  });

  it("does not swallow /api paths", async () => {
    expect((await request(site).get("/api/health")).body).toEqual({ ok: true });
    expect((await request(site).get("/api/nope")).status).toBe(404);
  });
});
