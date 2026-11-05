import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api, ApiError } from "./api";
import { useAuth } from "./auth";
import { BOOKING_BADGE, type OwnBooking } from "./Bookings";
import { formatDate, formatTime } from "./time";

// F-09 section 4.2: the same shape for the student and the slot's advisor.
type BookingDetailDto = OwnBooking & { student: { id: number; name: string } };

// F-09 section 5. Replaces the F-07 stand-in. A 404 shows only "Booking not found." with the
// back link, so the page never hints whether the booking exists.
export function BookingDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const confirmed = (useLocation().state as { confirmed?: boolean } | null)?.confirmed;
  const [booking, setBooking] = useState<BookingDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBooking(null);
    setError(null);
    api<BookingDetailDto>(`/api/bookings/${id}`)
      .then(setBooking)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Something went wrong."));
  }, [id]);

  const back =
    user?.role === "ADVISOR" ? <Link to="/schedule">Back to my schedule</Link> : <Link to="/bookings">Back to my bookings</Link>;

  return (
    <main className="container py-4">
      {confirmed && booking && <div className="alert alert-success" role="status">Booking confirmed.</div>}
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {!booking && !error && <div className="spinner-border" role="status" />}
      {booking && (
        <>
          <h1 className="h3 mb-3">Booking</h1>
          <dl className="row">
            <dt className="col-sm-3">When</dt>
            <dd className="col-sm-9">
              {formatDate(booking.slot.startAt)}, {formatTime(booking.slot.startAt)}-{formatTime(booking.slot.endAt)}
            </dd>
            <dt className="col-sm-3">Advisor</dt>
            <dd className="col-sm-9">{booking.advisor.name}</dd>
            <dt className="col-sm-3">Student</dt>
            <dd className="col-sm-9">{booking.student.name}</dd>
            <dt className="col-sm-3">Status</dt>
            <dd className="col-sm-9">
              <span className={`badge ${BOOKING_BADGE[booking.status]}`}>{booking.status}</span>
            </dd>
          </dl>
        </>
      )}
      <p className="mt-3">{back}</p>
    </main>
  );
}
