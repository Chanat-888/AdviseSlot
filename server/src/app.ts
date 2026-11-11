import { fileURLToPath } from "node:url";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { prisma } from "./db.js";
import { sendError } from "./errors.js";
import { authRouter } from "./routes/auth.js";
import { bookingsRouter } from "./routes/bookings.js";
import { slotsRouter } from "./routes/slots.js";
import { serveClient } from "./static.js";

export const app = express();

app.use(express.json());
if (process.env.CLIENT_ORIGIN) {
  app.use(cors({ origin: process.env.CLIENT_ORIGIN, credentials: true }));
}

// Smoke check: the server runs and can reach PostgreSQL.
app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", db: "up" });
  } catch {
    res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database is not reachable." } });
  }
});

// Readiness: for Cloud Run and CI. 200 only when the database answers.
app.get("/api/ready", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ready", db: "up" });
  } catch {
    res.status(503).json({ status: "not ready", db: "down" });
  }
});

app.use("/api/auth", authRouter);
app.use("/api/slots", slotsRouter);
app.use("/api/bookings", bookingsRouter);

// R-02: an unknown /api path (or wrong method) gets the SDS error shape, not Express's HTML page.
app.use("/api", (_req, res) => {
  sendError(res, 404, "NOT_FOUND", "Not found.");
});

// Production: serve the built client from the same origin, so the session cookie works.
if (process.env.NODE_ENV === "production") {
  serveClient(app, process.env.CLIENT_DIST ?? fileURLToPath(new URL("../../client/dist", import.meta.url)));
}

// SDS section 5: every error uses { error: { code, message } }. No stack trace in the body.
app.use((err: { status?: number; type?: string }, _req: Request, res: Response, _next: NextFunction) => {
  if (err.type === "entity.parse.failed") {
    return sendError(res, 400, "VALIDATION_ERROR", "Request body must be valid JSON.");
  }
  console.error(err);
  sendError(res, 500, "INTERNAL_ERROR", "Something went wrong.");
});
