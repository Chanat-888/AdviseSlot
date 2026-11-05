import type { NextFunction, Request, Response } from "express";
import { sendError } from "../errors.js";
import type { AuthUser } from "./requireAuth.js";

// SDS section 7: runs after requireAuth. The other role gets 403 FORBIDDEN_ROLE with the
// endpoint's own message (each contract's section 4.3).
export function requireRole(role: AuthUser["role"], message: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== role) return sendError(res, 403, "FORBIDDEN_ROLE", message);
    next();
  };
}
