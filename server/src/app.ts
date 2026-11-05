import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { prisma } from "./db.js";
import { sendError } from "./errors.js";
import { authRouter } from "./routes/auth.js";
import { bookingsRouter } from "./routes/bookings.js";
import { slotsRouter } from "./routes/slots.js";

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

app.use("/api/auth", authRouter);
app.use("/api/slots", slotsRouter);
app.use("/api/bookings", bookingsRouter);

// SDS section 5: every error uses { error: { code, message } }. No stack trace in the body.
app.use((err: { status?: number; type?: string }, _req: Request, res: Response, _next: NextFunction) => {
  if (err.type === "entity.parse.failed") {
    return sendError(res, 400, "VALIDATION_ERROR", "Request body must be valid JSON.");
  }
  console.error(err);
  sendError(res, 500, "INTERNAL_ERROR", "Something went wrong.");
});
