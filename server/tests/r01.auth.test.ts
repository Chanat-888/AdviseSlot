import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { createUsers, loginCookie, resetUsers, type Fixture } from "./helpers.js";

// R-01 Authentication and authorization, TEST-R01-01 (AC-R01-01, NFR-02):
// every protected Sprint 1 endpoint returns 401 to an unauthenticated request, with no private data.
// Issue #17. Covers F-01 to F-09. The route inventory test below fails if a route is added to the
// app without being listed here or in PUBLIC, so a Sprint 2 or 3 endpoint cannot be missed.

// `route` is the Express pattern for the inventory; `path` is the URL actually called.
type Endpoint = { method: "get" | "post"; path: string; route?: string; body?: object };

// Every route that needs a session. `:id` paths use a well-formed id, so a 401 cannot be a 400.
const PROTECTED: Endpoint[] = [
  { method: "get", path: "/api/auth/me" },
  { method: "post", path: "/api/auth/logout" },
  { method: "post", path: "/api/slots", body: { startAt: "2026-11-10T02:00:00.000Z" } },
  { method: "get", path: "/api/slots/mine" },
  { method: "get", path: "/api/slots/bookable" },
  { method: "post", path: "/api/bookings", body: { slotId: 1 } },
  { method: "get", path: "/api/bookings/mine" },
  { method: "get", path: "/api/bookings/1", route: "/api/bookings/:id" },
];

// Routes that are deliberately open (SDS section 5.1).
const PUBLIC = ["GET /api/health", "GET /api/ready", "POST /api/auth/login"];

const HOUR = 60 * 60 * 1000;
const UNAUTHENTICATED = { error: { code: "UNAUTHENTICATED", message: "You are not logged in." } };

let student: Fixture;

function call(e: Endpoint, cookie?: string) {
  let req = request(app)[e.method](e.path);
  if (cookie) req = req.set("Cookie", cookie);
  return e.body ? req.send(e.body) : req;
}

// Lists "METHOD /path" for every route registered on the app, including mounted routers.
type Layer = {
  route?: { path: string; methods: Record<string, boolean> };
  name: string;
  regexp: RegExp;
  handle: { stack?: Layer[] };
};
function registeredRoutes(): string[] {
  const out: string[] = [];
  const walk = (stack: Layer[], prefix: string) => {
    for (const layer of stack) {
      if (layer.route) {
        for (const m of Object.keys(layer.route.methods)) {
          out.push(`${m.toUpperCase()} ${(prefix + layer.route.path).replace(/\/$/, "")}`);
        }
      } else if (layer.name === "router" && layer.handle.stack) {
        // Express 4 mount regexp, e.g. /^\/api\/slots\/?(?=\/|$)/i
        const mount = layer.regexp.source.replace("^", "").replace("\\/?(?=\\/|$)", "").replace(/\\\//g, "/");
        walk(layer.handle.stack, prefix + mount);
      }
    }
  };
  walk((app as unknown as { _router: { stack: Layer[] } })._router.stack, "");
  return out.sort();
}

beforeAll(async () => {
  ({ student } = await createUsers());
}, 30_000);

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await resetUsers();
  await prisma.$disconnect();
});

describe("TEST-R01-01 (AC-R01-01): every protected endpoint needs a session", () => {
  it("the protected list covers every registered route that is not public", () => {
    const listed = [...PROTECTED.map((e) => `${e.method.toUpperCase()} ${e.route ?? e.path}`), ...PUBLIC].sort();
    expect(registeredRoutes()).toEqual(listed);
  });

  describe.each(PROTECTED)("$method $path", (endpoint) => {
    const cases: Array<[string, () => Promise<string | undefined>]> = [
      ["no cookie", async () => undefined],
      ["an unknown token", async () => "sid=not-a-real-token"],
      ["an empty sid", async () => "sid="],
      [
        "an expired session",
        async () => {
          vi.useFakeTimers({ toFake: ["Date"] });
          vi.setSystemTime(new Date("2026-11-09T03:00:00.000Z"));
          const cookie = await loginCookie(student.email);
          vi.setSystemTime(new Date("2026-11-09T03:00:00.000Z").getTime() + 2 * HOUR);
          return cookie;
        },
      ],
    ];

    it.each(cases)("returns 401 UNAUTHENTICATED with %s and no private data", async (_name, cookieFor) => {
      const res = await call(endpoint, await cookieFor());
      expect(res.status).toBe(401);
      expect(res.headers["content-type"]).toMatch(/application\/json/);
      expect(res.body).toEqual(UNAUTHENTICATED);
      expect(res.text).not.toMatch(/@example\.test|passwordHash|tokenHash|"id"/);
    });
  });

  it("a logged-out cookie is refused on every protected endpoint (AC-F02-01)", async () => {
    const cookie = await loginCookie(student.email);
    expect((await request(app).post("/api/auth/logout").set("Cookie", cookie)).status).toBe(204);
    for (const endpoint of PROTECTED) {
      const res = await call(endpoint, cookie);
      expect(res.status, `${endpoint.method} ${endpoint.path}`).toBe(401);
      expect(res.body).toEqual(UNAUTHENTICATED);
    }
  });

  it("a protected request without a session writes nothing (no Slot or Booking row)", async () => {
    const slots = await prisma.slot.count();
    const bookings = await prisma.booking.count();
    for (const endpoint of PROTECTED.filter((e) => e.method === "post")) await call(endpoint);
    expect(await prisma.slot.count()).toBe(slots);
    expect(await prisma.booking.count()).toBe(bookings);
  });
});
