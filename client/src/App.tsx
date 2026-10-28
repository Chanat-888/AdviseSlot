import { useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

type Health = { kind: "loading" } | { kind: "ok"; db: string } | { kind: "error"; message: string };

// Placeholder page: shows that the client can reach the API and the API can reach the database.
export function App() {
  const [health, setHealth] = useState<Health>({ kind: "loading" });

  useEffect(() => {
    fetch(`${API_URL}/api/health`, { credentials: "include" })
      .then(async (res) => {
        const body = await res.json();
        if (res.ok) setHealth({ kind: "ok", db: body.db });
        else setHealth({ kind: "error", message: body.error?.message ?? `HTTP ${res.status}` });
      })
      .catch(() => setHealth({ kind: "error", message: "API is not reachable." }));
  }, []);

  return (
    <main className="container py-5">
      <h1 className="mb-3">AdviseSlot</h1>
      {health.kind === "loading" && <div className="spinner-border" role="status" />}
      {health.kind === "ok" && <div className="alert alert-success">API ok, database {health.db}.</div>}
      {health.kind === "error" && <div className="alert alert-danger">{health.message}</div>}
    </main>
  );
}
