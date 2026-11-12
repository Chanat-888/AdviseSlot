import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../src/app.js";

const saved = process.env.APP_COMMIT;

afterEach(() => {
  if (saved === undefined) delete process.env.APP_COMMIT;
  else process.env.APP_COMMIT = saved;
});

describe("GET /api/version", () => {
  it("returns the commit from APP_COMMIT, without logging in", async () => {
    process.env.APP_COMMIT = "0123456789abcdef0123456789abcdef01234567";
    const res = await request(app).get("/api/version");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ commit: "0123456789abcdef0123456789abcdef01234567" });
  });

  it("returns dev when APP_COMMIT is not set (local run)", async () => {
    delete process.env.APP_COMMIT;
    const res = await request(app).get("/api/version");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ commit: "dev" });
  });
});
