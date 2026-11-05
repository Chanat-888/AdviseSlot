import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db.js";
import { sendError } from "../errors.js";
import { clearSessionCookie, hashToken, readSessionCookie } from "../session.js";

export type AuthUser = { id: number; name: string; email: string; role: "STUDENT" | "ADVISOR" };

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}

// F-01 section 3.4: valid while now < expiresAt. A 401 clears the cookie but keeps the row.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = readSessionCookie(req);
    const session = token
      ? await prisma.session.findUnique({
          where: { tokenHash: hashToken(token) },
          include: { user: { select: { id: true, name: true, email: true, role: true } } },
        })
      : null;
    if (!session || session.expiresAt.getTime() <= Date.now()) {
      clearSessionCookie(res);
      return sendError(res, 401, "UNAUTHENTICATED", "You are not logged in.");
    }
    req.user = session.user;
    next();
  } catch (err) {
    next(err);
  }
}
