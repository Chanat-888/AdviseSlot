import express, { type Express } from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Serves the built client (Vite output) and falls back to index.html for any other
 * non-/api GET, so React Router paths such as /slots work on reload. Call it after the
 * API routes. Does nothing if the folder has no index.html.
 */
export function serveClient(app: Express, dir: string) {
  const index = join(dir, "index.html");
  if (!existsSync(index)) {
    console.warn(`Client build not found at ${dir}; serving the API only.`);
    return;
  }
  app.use(express.static(dir, { index: false }));
  app.get(/^(?!\/api(\/|$)).*/, (_req, res) => res.sendFile(index));
}
