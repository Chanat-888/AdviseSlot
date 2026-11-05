import { Router } from "express";
import { sendError } from "../errors.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { createSlot, listOwnSlots } from "../services/slots.js";

export const slotsRouter = Router();

// F-04 section 4.3.
const MESSAGES = {
  SLOT_NOT_WEEKDAY: [422, "Slots can only be on Monday to Friday."],
  SLOT_INVALID_START_MINUTE: [422, "A slot must start on the hour or half hour."],
  SLOT_OUTSIDE_HOURS: [422, "Slots must be between 08:00 and 18:00."],
  SLOT_IN_PAST: [422, "This start time is in the past."],
  SLOT_UNBOOKABLE: [422, "This slot starts too soon to be booked."],
  SLOT_OVERLAP: [409, "This slot overlaps one of your slots."],
} as const;

// ISO 8601 with a time zone (Z or an offset), F-04 section 3.1.
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

function parseStartAt(body: unknown): Date | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const { startAt } = body as Record<string, unknown>;
  if (typeof startAt !== "string" || !ISO_WITH_ZONE.test(startAt)) return null;
  const d = new Date(startAt);
  return Number.isNaN(d.getTime()) ? null : d;
}

// F-04: create a slot. Only startAt is read; the advisor comes from the session (BR-08).
slotsRouter.post("/", requireAuth, requireRole("ADVISOR", "Only advisors can create slots."), async (req, res, next) => {
  try {
    const startAt = parseStartAt(req.body);
    if (!startAt) return sendError(res, 400, "VALIDATION_ERROR", "A valid start time is required.");

    const result = await createSlot(req.user!.id, startAt, new Date());
    if (!result.ok) {
      const [status, message] = MESSAGES[result.code];
      return sendError(res, status, result.code, message);
    }
    res.status(201).json(result.slot);
  } catch (err) {
    next(err);
  }
});

// F-05: the advisor's own slots with status.
slotsRouter.get(
  "/mine",
  requireAuth,
  requireRole("ADVISOR", "Only advisors can view their schedule."),
  async (req, res, next) => {
    try {
      res.json(await listOwnSlots(req.user!.id, new Date()));
    } catch (err) {
      next(err);
    }
  },
);
