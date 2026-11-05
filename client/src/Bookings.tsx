import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "./api";
import { formatDate, formatTime } from "./time";

// The item of F-08 section 4.2 (the F-09 detail without `student`).
export type OwnBooking = {
  id: number;
  status: "Upcoming" | "Passed" | "Cancelled";
  createdAt: string;
  slot: { id: number; startAt: string; endAt: string };
  advisor: { id: number; name: string };
};

// D-24 status words, shared with the detail screen.
export const BOOKING_BADGE: Record<OwnBooking["status"], string> = {
  Upcoming: "bg-primary",
  Passed: "bg-light text-dark border",
  Cancelled: "bg-secondary",
};

// The server already sorts: Upcoming first, then the rest most recent first (F-08 section 2).
const SECTIONS: OwnBooking["status"][] = ["Upcoming", "Passed", "Cancelled"];

// F-08 section 5: the student's bookings in Upcoming and Passed sections.
export function Bookings() {
  const [bookings, setBookings] = useState<OwnBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<OwnBooking[]>("/api/bookings/mine")
      .then(setBookings)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Something went wrong."));
  }, []);

  return (
    <main className="container py-4">
      <h1 className="mb-4">My bookings</h1>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {bookings === null && !error && <div className="spinner-border" role="status" />}
      {bookings && bookings.length === 0 && (
        <p className="text-muted">
          You have no bookings yet. <Link to="/slots">Find a slot</Link>
        </p>
      )}
      {bookings &&
        SECTIONS.map((status) => {
          const items = bookings.filter((b) => b.status === status);
          if (items.length === 0) return null;
          return (
            <section key={status} className="mb-4">
              <h2 className="h5">{status}</h2>
              <ul className="list-group">
                {items.map((b) => (
                  <li key={b.id} className="list-group-item">
                    <Link to={`/bookings/${b.id}`} className="d-flex align-items-center gap-3 flex-wrap text-decoration-none">
                      <span>{formatDate(b.slot.startAt)}</span>
                      <span className="font-monospace">{formatTime(b.slot.startAt)}-{formatTime(b.slot.endAt)}</span>
                      <span>{b.advisor.name}</span>
                      <span className={`badge ${BOOKING_BADGE[b.status]} ms-auto`}>{b.status}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
    </main>
  );
}
