import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError } from "./api";
import { bangkokDate, formatDate, formatTime } from "./time";

// F-17 section 4.2.
type SummaryData = {
  from: string;
  to: string;
  counts: { slots: number; booked: number; cancelled: number; open: number };
  upcoming: { id: number; slot: { id: number; startAt: string; endAt: string }; student: { id: number; name: string } }[];
};

const COUNTS: [keyof SummaryData["counts"], string][] = [
  ["slots", "Slots"],
  ["booked", "Booked"],
  ["cancelled", "Cancelled"],
  ["open", "Open"],
];

/** A date input value plus `days` days ("2026-11-09" + 6 = "2026-11-15"). */
function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

// F-17 section 5: the advisor's counts and upcoming appointments for From to To (Bangkok days),
// kept in the page URL as ?from=&to=. The server validates the range and computes every number.
export function Summary() {
  const [params, setParams] = useSearchParams();
  const from = params.get("from");
  const to = params.get("to");
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Section 2, step 1: a missing end becomes today and today + 6 days (Bangkok), in the URL.
  useEffect(() => {
    if (from !== null && to !== null) return;
    const today = bangkokDate(new Date().toISOString());
    setParams({ from: from ?? today, to: to ?? addDays(today, 6) }, { replace: true });
  }, [from, to, setParams]);

  useEffect(() => {
    if (from === null || to === null) return;
    let stale = false; // a later range replaces this request's answer
    setLoading(true);
    setError(null);
    api<SummaryData>(`/api/summary?${new URLSearchParams({ from, to })}`)
      .then((s) => {
        if (!stale) setSummary(s);
      })
      .catch((err) => {
        if (stale) return;
        setSummary(null); // a 400 for a bad range: the message and no numbers (section 5)
        setError(err instanceof ApiError ? err.message : "Something went wrong.");
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [from, to]);

  function setEnd(key: "from" | "to", value: string) {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next);
  }

  return (
    <main className="container py-4">
      <h1 className="mb-4">Summary</h1>
      <div className="d-flex flex-wrap align-items-end gap-3 mb-4">
        <div>
          <label htmlFor="summary-from" className="form-label">From</label>
          <input id="summary-from" type="date" className="form-control" value={from ?? ""} onChange={(e) => setEnd("from", e.target.value)} />
        </div>
        <div>
          <label htmlFor="summary-to" className="form-label">To</label>
          <input id="summary-to" type="date" className="form-control" value={to ?? ""} onChange={(e) => setEnd("to", e.target.value)} />
        </div>
        {loading && <div className="spinner-border mb-1" role="status" />}
      </div>

      {error && <div className="alert alert-danger" role="alert">{error}</div>}

      {summary && !error && (
        <>
          <div className="row row-cols-2 row-cols-md-4 g-3 mb-4">
            {COUNTS.map(([key, label]) => (
              <div className="col" key={key}>
                <div className="card text-center">
                  <div className="card-body">
                    <div id={`count-${key}`} className="small text-muted">{label}</div>
                    <div className="fs-3 fw-semibold" aria-labelledby={`count-${key}`}>{summary.counts[key]}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <h2 className="h5">Upcoming</h2>
          {summary.upcoming.length === 0 ? (
            <p className="text-muted">No upcoming appointments in this range.</p>
          ) : (
            <ul className="list-group">
              {summary.upcoming.map((u) => (
                <li key={u.id} className="list-group-item d-flex flex-wrap gap-3 align-items-center">
                  <span>{formatDate(u.slot.startAt)}</span>
                  <span className="font-monospace">{formatTime(u.slot.startAt)}-{formatTime(u.slot.endAt)}</span>
                  <span>{u.student.name}</span>
                  <Link to={`/bookings/${u.id}`} className="ms-auto">Open</Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
