import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// R-03 Configuration and secrets, TEST-R03-01 (AC-R03-01, NFR-08): no secret in Git or in the
// client bundle, and configuration comes from environment variables. Issue #17. The PR template
// checklist (.github/pull_request_template.md) is the manual half of this test.
//
// The only credentials allowed in Git are the documented local-only ones: the Docker dev database
// password in docker-compose.yml and the .env.example files, the README demo password, and the
// test password in tests/helpers.ts. None of them is used outside a developer's machine.

const ROOT = path.resolve(__dirname, "../..");
const ALLOWED_DB_PASSWORDS = new Set(["adviseslot_dev"]);
const BINARY = /\.(png|jpe?g|gif|ico|pdf|woff2?|ttf|zip)$/i;

// Patterns are written so that this file does not match itself.
const SECRET_PATTERNS: Array<[string, RegExp]> = [
  ["private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["GCP service account key", /"private_key"\s*:\s*"/],
  ["Google API key", /AIza[0-9A-Za-z_-]{35}/],
  ["AWS access key", /AKIA[0-9A-Z]{16}/],
  ["GitHub token", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|github_pat_[A-Za-z0-9_]{60,}/],
  ["Slack token", /xox[abprs]-[A-Za-z0-9-]{10,}/],
];

function git(...args: string[]): string[] {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
}

const tracked = git("ls-files");
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");

describe("TEST-R03-01 (AC-R03-01): no secret in Git or the client bundle", () => {
  it("only .env.example files are tracked, never a real .env", () => {
    const envFiles = tracked.filter((f) => /(^|\/)\.env(\.|$)/.test(f));
    expect(envFiles.every((f) => /\.example$/.test(f)), envFiles.join(", ")).toBe(true);
  });

  it("no tracked file contains a key, token or private key", () => {
    const hits: string[] = [];
    for (const file of tracked.filter((f) => !BINARY.test(f))) {
      const text = read(file);
      for (const [name, pattern] of SECRET_PATTERNS) {
        if (pattern.test(text)) hits.push(`${file}: ${name}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("every database URL in Git uses the local dev password only", () => {
    const hits: string[] = [];
    for (const file of tracked.filter((f) => !BINARY.test(f))) {
      for (const m of read(file).matchAll(/postgres(?:ql)?:\/\/[^:\s/"'`]+:([^@\s"'`]+)@/g)) {
        if (!ALLOWED_DB_PASSWORDS.has(m[1])) hits.push(`${file}: ${m[0]}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("the client reads only public VITE_ variables, so nothing secret reaches the bundle", () => {
    const sources = tracked.filter((f) => f.startsWith("client/src/"));
    expect(sources.length).toBeGreaterThan(0);
    const offending: string[] = [];
    for (const file of sources) {
      const text = read(file);
      if (/process\.env/.test(text)) offending.push(`${file}: process.env`);
      for (const m of text.matchAll(/import\.meta\.env\.([A-Z_]+)/g)) {
        if (!m[1].startsWith("VITE_") && !["DEV", "PROD", "MODE", "BASE_URL", "SSR"].includes(m[1])) {
          offending.push(`${file}: ${m[0]}`);
        }
      }
      if (/DATABASE_URL|adviseslot_dev|passwordHash/.test(text)) offending.push(`${file}: server config or secret`);
    }
    expect(offending).toEqual([]);
    const clientEnv = read("client/.env.example")
      .split("\n")
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => l.split("=")[0]);
    expect(clientEnv.every((k) => k.startsWith("VITE_"))).toBe(true);
  });

  it("server configuration comes from environment variables, not from source", () => {
    const sources = tracked.filter((f) => f.startsWith("server/src/"));
    const hardcoded = sources.filter((f) => /postgres(?:ql)?:\/\//.test(read(f)));
    expect(hardcoded).toEqual([]);
  });
});
