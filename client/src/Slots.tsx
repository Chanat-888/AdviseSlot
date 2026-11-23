import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "./api";
import { formatDate, formatTime } from "./time";

// The item of F-06 section 4.2. Every listed slot is Open, and there is no booker data (BR-09).
type BookableSlot = {
  id: number;
  startAt: string;
  endAt: string;
  isLate: boolean;
  bookingDeadline: string;
  advisor: { id: number; name: string };
};

type Booking = { id: number };

// F-09 detail, only the part the reschedule banner needs.
type MovingBooking = { id: number; slot: { startAt: string } };

const message = (err: unknown) => (err instanceof ApiError ? err.message : "Something went wrong.");

// F-06 section 5 and F-07 section 5: bookable slots grouped by date, one Book button per row.
// F-14 section 5: with ?reschedule=<booking id>, a banner names the booking being moved and each
// row has Move here instead of Book.
export function Slots() {
  const navigate = useNavigate();
  const rescheduleId = useSearchParams()[0].get("reschedule");
  const [moving, setMoving] = useState<MovingBooking | null>(null);
  const [slots, setSlots] = useState<BookableSlot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<number | null>(null); // the slot whose request is running

  const load = useCallback(() => {
    return api<BookableSlot[]>("/api/slots/bookable")
      .then(setSlots) // keep an error shown by a failed booking while the list reloads
      .catch((err) => setError(message(err)));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setMoving(null);
    if (rescheduleId === null) return;
    api<MovingBooking>(`/api/bookings/${rescheduleId}`)
      .then(setMoving)
      .catch((err) => setError(message(err)));
  }, [rescheduleId]);

  async function onBook(slot: BookableSlot) {
    if (bookingId !== null) return; // a double click sends one request
    setBookingId(slot.id);
    setError(null);
    try {
      if (rescheduleId !== null) {
        const booking = await api<Booking>(`/api/bookings/${rescheduleId}/reschedule`, {
          method: "POST",
          body: JSON.stringify({ newSlotId: slot.id }),
        });
        navigate(`/bookings/${booking.id}`, { state: { moved: true } });
        return;
      }
      const booking = await api<Booking>("/api/bookings", { method: "POST", body: JSON.stringify({ slotId: slot.id }) });
      navigate(`/bookings/${booking.id}`, { state: { confirmed: true } });
    } catch (err) {
      setError(message(err)); // 409 or 422: show the server's message, then reload (the slot may be gone)
      await load();
      setBookingId(null);
    }
  }

  const groups = new Map<string, BookableSlot[]>();
  for (const s of slots ?? []) {
    const key = formatDate(s.startAt);
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }

  return (
    <main className="container py-4">
      <h1 className="mb-4">Bookable slots</h1>
      {rescheduleId !== null && (
        <div className="alert alert-info d-flex flex-wrap gap-3 align-items-center" role="status">
          <span>
            Choose a new time for your booking
            {moving && ` on ${formatDate(moving.slot.startAt)}, ${formatTime(moving.slot.startAt)}`}.
          </span>
          <Link to={`/bookings/${rescheduleId}`} className="ms-auto">Cancel move</Link>
        </div>
      )}
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {slots === null && !error && <div className="spinner-border" role="status" />}
      {slots && slots.length === 0 && <p className="text-muted">No bookable slots right now.</p>}
      {[...groups].map(([day, items]) => (
        <section key={day} className="mb-3">
          <h2 className="h6 text-muted">{day}</h2>
          <ul className="list-group">
            {items.map((s) => (
              <li key={s.id} className="list-group-item d-flex align-items-center gap-3 flex-wrap">
                <span className="font-monospace">{formatTime(s.startAt)}-{formatTime(s.endAt)}</span>
                <span>{s.advisor.name}</span>
                {s.isLate && <span className="badge text-bg-warning">Late slot</span>}
                <small className="text-muted">
                  Book by {formatDate(s.bookingDeadline)}, {formatTime(s.bookingDeadline)}
                </small>
                <button
                  type="button"
                  className="btn btn-primary btn-sm ms-auto"
                  disabled={bookingId !== null}
                  onClick={() => onBook(s)}
                  aria-label={`${rescheduleId !== null ? "Move here" : "Book"} ${s.advisor.name} ${formatDate(s.startAt)} ${formatTime(s.startAt)}`}
                >
                  {bookingId === s.id && <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />}
                  {rescheduleId !== null ? "Move here" : "Book"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
