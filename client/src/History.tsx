import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "./api";
import { BOOKING_BADGE, type OwnBooking } from "./Bookings";
import { formatDate, formatTime } from "./time";

// F-18 section 4.2: the F-09 detail shape, with the student who booked.
type HistoryItem = OwnBooking & { student: { id: number; name: string } };

// F-18 section 5: who cancelled, from the advisor's side.
function cancelNote(b: HistoryItem): string | null {
  const c = b.cancellation;
  if (!c) return null;
  return c.cancelledBy.role === "STUDENT" ? `Cancelled by ${c.cancelledBy.name}` : `Cancelled by you: ${c.reason ?? ""}`;
}

// F-18 section 5: the advisor's cancelled and passed bookings, newest first (the server sorts).
export function History() {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<HistoryItem[]>("/api/bookings/history")
      .then(setItems)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Something went wrong."));
  }, []);

  return (
    <main className="container py-4">
      <h1 className="mb-4">History</h1>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {items === null && !error && <div className="spinner-border" role="status" />}
      {items && items.length === 0 && <p className="text-muted">No cancelled or past bookings yet.</p>}
      {items && items.length > 0 && (
        <table className="table align-middle">
          <thead>
            <tr>
              <th scope="col">Date and time</th>
              <th scope="col">Student</th>
              <th scope="col">Status</th>
              <th scope="col">Cancellation</th>
            </tr>
          </thead>
          <tbody>
            {items.map((b) => (
              <tr key={b.id}>
                <td>
                  <Link to={`/bookings/${b.id}`}>
                    {formatDate(b.slot.startAt)}, {formatTime(b.slot.startAt)}-{formatTime(b.slot.endAt)}
                  </Link>
                </td>
                <td>{b.student.name}</td>
                <td><span className={`badge ${BOOKING_BADGE[b.status]}`}>{b.status}</span></td>
                <td className="small text-muted">{cancelNote(b)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
