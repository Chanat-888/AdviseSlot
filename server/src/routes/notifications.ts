import { Router } from "express";
import { sendError } from "../errors.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { listNotifications, markNotificationRead } from "../services/notifications.js";
import { parseId } from "./ids.js";

// F-19 sections 2.2, 2.3 and 4. Students only (NFR-03); each student sees only their own (BR-09).
export const notificationsRouter = Router();

const onlyStudents = requireRole("STUDENT", "Only students have notifications.");

notificationsRouter.get("/", requireAuth, onlyStudents, async (req, res, next) => {
  try {
    res.json(await listNotifications(req.user!.id, new Date()));
  } catch (err) {
    next(err);
  }
});

notificationsRouter.post("/:id/read", requireAuth, onlyStudents, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return sendError(res, 400, "VALIDATION_ERROR", "The notification id must be a positive whole number.");
    const item = await markNotificationRead(req.user!.id, id, new Date());
    if (!item) return sendError(res, 404, "NOT_FOUND", "Notification not found.");
    res.json(item);
  } catch (err) {
    next(err);
  }
});
