import cors from "cors";
import express from "express";
import { prisma } from "./db.js";

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
