import { Router } from "express";
import { sendError } from "../errors.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { createBooking } from "../services/bookings.js";

export const bookingsRouter = Router();

const dayMonth = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", day: "numeric", month: "short" });
const hourMinute = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false });

// "Booking for this slot closed at 18:00 on 9 Nov." (F-07 section 4.3, Asia/Bangkok)
const deadlineMessage = (d: Date) => `Booking for this slot closed at ${hourMinute.format(d)} on ${dayMonth.format(d)}.`;

function parseSlotId(body: unknown): number | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const { slotId } = body as Record<string, unknown>;
  return typeof slotId === "number" && Number.isSafeInteger(slotId) && slotId > 0 ? slotId : null;
}

// F-07: book a slot. Only slotId is read; the student comes from the session (BR-09).
bookingsRouter.post("/", requireAuth, requireRole("STUDENT", "Only students can book slots."), async (req, res, next) => {
  try {
    const slotId = parseSlotId(req.body);
    if (slotId === null) return sendError(res, 400, "VALIDATION_ERROR", "A slot is required.");

    const result = await createBooking(req.user!.id, slotId, new Date());
    if (result.ok) return void res.status(201).json(result.booking);
    switch (result.code) {
      case "NOT_FOUND":
        return sendError(res, 404, "NOT_FOUND", "This slot does not exist.");
      case "SLOT_TAKEN":
        return sendError(res, 409, "SLOT_TAKEN", "This slot has just been booked by someone else.");
      case "ACTIVE_BOOKING_LIMIT":
        return sendError(res, 409, "ACTIVE_BOOKING_LIMIT", "You already have an upcoming booking.");
      case "BOOKING_DEADLINE_PASSED":
        return sendError(res, 422, "BOOKING_DEADLINE_PASSED", deadlineMessage(result.deadline!));
    }
  } catch (err) {
    next(err);
  }
});
