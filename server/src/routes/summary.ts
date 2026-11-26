import { Router } from "express";
import { bangkokDay } from "../domain/rules.js";
import { sendError } from "../errors.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { getSummary } from "../services/summary.js";

export const summaryRouter = Router();

const DAY = 24 * 60 * 60 * 1000;
const MAX_DAYS = 90; // D-33: keeps one request small; not an SRS rule

// F-17 section 3.1: one plain string, or null (missing, empty, given twice, `from[]=`, `from[a]=`).
const plainString = (value: unknown) => (typeof value === "string" && value !== "" ? value : null);

// F-17: the advisor's appointment summary for the Bangkok days `from` to `to`, both included.
// The query is checked in the order of section 3.1, before any database read.
summaryRouter.get(
  "/",
  requireAuth,
  requireRole("ADVISOR", "Only advisors have an appointment summary."),
  async (req, res, next) => {
    try {
      const from = plainString(req.query.from);
      const to = plainString(req.query.to);
      const first = from === null ? null : bangkokDay(from);
      const last = to === null ? null : bangkokDay(to);
      if (!from || !to || !first || !last) {
        return sendError(res, 400, "VALIDATION_ERROR", "from and to must be real dates written as YYYY-MM-DD.");
      }
      if (last.start < first.start) {
        return sendError(res, 400, "VALIDATION_ERROR", "to must be on or after from.");
      }
      if (last.end.getTime() - first.start.getTime() > MAX_DAYS * DAY) {
        return sendError(res, 400, "VALIDATION_ERROR", "The range can be at most 90 days.");
      }
      res.json(await getSummary(req.user!.id, { from, to, start: first.start, end: last.end }, new Date()));
    } catch (err) {
      next(err);
    }
  },
);
