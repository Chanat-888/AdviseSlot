import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";

export const advisorsRouter = Router();

// F-16 section 2, step 5: every advisor as { id, name } for the filter on /slots, sorted by name,
// then id. Advisors with no open slots are included. No email or other user field (BR-09).
advisorsRouter.get("/", requireAuth, requireRole("STUDENT", "Only students can list advisors."), async (_req, res, next) => {
  try {
    res.json(
      await prisma.user.findMany({
        where: { role: "ADVISOR" },
        select: { id: true, name: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      }),
    );
  } catch (err) {
    next(err);
  }
});
