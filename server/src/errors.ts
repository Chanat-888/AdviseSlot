import type { Response } from "express";

// SDS section 5 error format.
export function sendError(res: Response, status: number, code: string, message: string) {
  res.status(status).json({ error: { code, message } });
}
