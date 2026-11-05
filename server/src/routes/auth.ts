import bcrypt from "bcryptjs";
import { Router } from "express";
import { prisma } from "../db.js";
import { sendError } from "../errors.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { clearSessionCookie, hashToken, newToken, readSessionCookie, SESSION_MS, setSessionCookie } from "../session.js";

export const authRouter = Router();

// Compared against when the email is unknown, so both failures take similar time (SDS section 7).
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", 12);

const INVALID = "Invalid email or password.";

authRouter.post("/login", async (req, res, next) => {
  try {
    const body: unknown = req.body;
    const { email, password } = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    if (typeof email !== "string" || typeof password !== "string" || email.trim() === "" || password === "") {
      return sendError(res, 400, "VALIDATION_ERROR", "Email and password are required.");
    }

    const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
    if (!user || !ok) return sendError(res, 401, "INVALID_CREDENTIALS", INVALID);

    const token = newToken();
    await prisma.session.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + SESSION_MS) },
    });
    setSessionCookie(res, token);
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    next(err);
  }
});

// F-03: own identity. requireAuth selects exactly { id, name, email, role }.
authRouter.get("/me", requireAuth, (req, res) => {
  res.json(req.user);
});

// F-02: ends only the session of the cookie sent (AC-F02-02), then clears the cookie.
authRouter.post("/logout", requireAuth, async (req, res, next) => {
  try {
    await prisma.session.delete({ where: { tokenHash: hashToken(readSessionCookie(req)!) } });
    clearSessionCookie(res);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
