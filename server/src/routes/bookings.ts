import { Router } from "express";
import { sendError } from "../errors.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { cancelBookingAsAdvisor, cancelBookingAsStudent, createBooking, getBookingFor, listOwnBookings } from "../services/bookings.js";
import { parseId } from "./ids.js";

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
      case "SAME_ADVISOR_BOOKING":
        return sendError(res, 409, "SAME_ADVISOR_BOOKING", "You already have an upcoming booking with this advisor.");
      case "ACTIVE_BOOKING_LIMIT":
        return sendError(res, 409, "ACTIVE_BOOKING_LIMIT", "You already have 2 upcoming bookings.");
      case "BOOKING_DEADLINE_PASSED":
        return sendError(res, 422, "BOOKING_DEADLINE_PASSED", deadlineMessage(result.deadline!));
    }
  } catch (err) {
    next(err);
  }
});

// F-08: the student's own bookings. Registered before "/:id" so "mine" is not read as an id.
bookingsRouter.get(
  "/mine",
  requireAuth,
  requireRole("STUDENT", "Only students have a booking list."),
  async (req, res, next) => {
    try {
      res.json(await listOwnBookings(req.user!.id, new Date()));
    } catch (err) {
      next(err);
    }
  },
);

// F-09 and F-10 section 3.1: the :id rule is the shared parseId (routes/ids.ts).
const BAD_BOOKING_ID = "The booking id must be a positive whole number.";

// F-09: booking detail for its student or its slot's advisor. Anyone else gets the same 404
// as a missing booking (SDS sections 5 and 6), so the booking's existence is not revealed.
bookingsRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return sendError(res, 400, "VALIDATION_ERROR", BAD_BOOKING_ID);
    const booking = await getBookingFor(req.user!.id, id, new Date());
    if (!booking) return sendError(res, 404, "NOT_FOUND", "Booking not found.");
    res.json(booking);
  } catch (err) {
    next(err);
  }
});

// F-10 section 4.3: the student's limit, 12 h before the start, in Asia/Bangkok.
const cancelLimitMessage = (limit: Date) =>
  `You can cancel only until 12 hours before the start (${hourMinute.format(limit)} on ${dayMonth.format(limit)}).`;

/** F-11 section 3.1: the trimmed reason, or null if it is not a string of 1 to 500 characters after trimming. */
function parseReason(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const { reason } = body as Record<string, unknown>;
  if (typeof reason !== "string") return null;
  const trimmed = reason.trim();
  return trimmed.length >= 1 && trimmed.length <= 500 ? trimmed : null;
}

// F-10 (student) and F-11 (advisor) share this endpoint (F-10 section 2, step 4).
bookingsRouter.post("/:id/cancel", requireAuth, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return sendError(res, 400, "VALIDATION_ERROR", BAD_BOOKING_ID);

    if (req.user!.role === "ADVISOR") {
      // F-11 section 3.1: the reason is checked before any database read, so a 400 says nothing
      // about whether the booking exists.
      const reason = parseReason(req.body);
      if (reason === null) return sendError(res, 400, "VALIDATION_ERROR", "A reason of 1 to 500 characters is required.");
      const result = await cancelBookingAsAdvisor(req.user!.id, id, reason, new Date());
      if (result.ok) return void res.json(result.booking);
      switch (result.code) {
        case "NOT_FOUND":
          return sendError(res, 404, "NOT_FOUND", "Booking not found.");
        case "BOOKING_NOT_ACTIVE":
          return sendError(res, 409, "BOOKING_NOT_ACTIVE", "This booking is no longer upcoming.");
        case "CANCEL_WINDOW_PASSED":
          return sendError(res, 422, "CANCEL_WINDOW_PASSED", "This appointment has already started.");
      }
    }

    // Student path. The body is ignored: a student's reason is not stored (F-10 section 3.1).
    const result = await cancelBookingAsStudent(req.user!.id, id, new Date());
    if (result.ok) return void res.json(result.booking);
    switch (result.code) {
      case "NOT_FOUND":
        return sendError(res, 404, "NOT_FOUND", "Booking not found.");
      case "BOOKING_NOT_ACTIVE":
        return sendError(res, 409, "BOOKING_NOT_ACTIVE", "This booking is no longer upcoming.");
      case "CANCEL_WINDOW_PASSED":
        return sendError(res, 422, "CANCEL_WINDOW_PASSED", cancelLimitMessage(result.limit));
    }
  } catch (err) {
    next(err);
  }
});
