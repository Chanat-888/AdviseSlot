import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api, ApiError } from "./api";
import { useAuth } from "./auth";
import { advisorCancelNote, BOOKING_BADGE, type OwnBooking } from "./Bookings";
import { formatDate, formatTime } from "./time";

// F-09 section 4.2: the same shape for the student and the slot's advisor. `cancellation` is
// present only for a cancelled booking (F-10 section 4.2, in OwnBooking).
type BookingDetailDto = OwnBooking & { student: { id: number; name: string } };

type CancelOutcome = { ok: true; booking: BookingDetailDto } | { ok: false; error: string };

// F-10 section 5: the student's Cancel button and its confirm. The client does not pre-check
// BR-11; the server decides and its message is shown.
function CancelBooking({ id, onDone }: { id: number; onDone: (result: CancelOutcome) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onYes() {
    setBusy(true);
    try {
      const booking = await api<BookingDetailDto>(`/api/bookings/${id}/cancel`, { method: "POST", body: "{}" });
      onDone({ ok: true, booking });
    } catch (err) {
      onDone({ ok: false, error: err instanceof ApiError ? err.message : "Something went wrong." });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <button type="button" className="btn btn-outline-danger" onClick={() => setConfirming(true)}>
        Cancel booking
      </button>
    );
  }
  return (
    <div className="border rounded p-3 d-inline-block" role="dialog" aria-label="Cancel this booking?">
      <p className="mb-2">Cancel this booking?</p>
      <button type="button" className="btn btn-danger me-2" onClick={onYes} disabled={busy}>
        {busy && <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />}
        Yes
      </button>
      <button type="button" className="btn btn-outline-secondary" onClick={() => setConfirming(false)} disabled={busy}>
        No
      </button>
    </div>
  );
}

const REASON_MAX = 500;

// F-11 section 5: the advisor's Cancel with a required reason. Confirm is disabled while the
// trimmed reason is empty or longer than 500; the server still validates (BR-12).
function AdvisorCancelBooking({ id, onDone }: { id: number; onDone: (result: CancelOutcome) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const length = reason.trim().length;

  async function onConfirm() {
    setBusy(true);
    try {
      const booking = await api<BookingDetailDto>(`/api/bookings/${id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      onDone({ ok: true, booking });
      setOpen(false);
    } catch (err) {
      onDone({ ok: false, error: err instanceof ApiError ? err.message : "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-outline-danger" onClick={() => setOpen(true)}>
        Cancel booking
      </button>
    );
  }
  return (
    <div className="border rounded p-3" role="dialog" aria-label="Cancel this booking?">
      <label htmlFor="cancel-reason" className="form-label">Reason (shown to the student)</label>
      <textarea id="cancel-reason" className="form-control" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className={`form-text mb-2 ${length > REASON_MAX ? "text-danger" : ""}`}>{length} / {REASON_MAX}</div>
      <button type="button" className="btn btn-danger me-2" onClick={onConfirm} disabled={busy || length === 0 || length > REASON_MAX}>
        {busy && <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />}
        Confirm
      </button>
      <button type="button" className="btn btn-outline-secondary" onClick={() => setOpen(false)} disabled={busy}>
        Back
      </button>
    </div>
  );
}

// F-09 section 5. Replaces the F-07 stand-in. A 404 shows only "Booking not found." with the
// back link, so the page never hints whether the booking exists.
export function BookingDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const state = useLocation().state as { confirmed?: boolean; moved?: boolean } | null;
  const confirmed = state?.confirmed;
  const moved = state?.moved; // F-14 section 2, step 7
  const [booking, setBooking] = useState<BookingDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const load = () =>
    api<BookingDetailDto>(`/api/bookings/${id}`)
      .then(setBooking)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Something went wrong."));

  useEffect(() => {
    setBooking(null);
    setError(null);
    setCancelled(false);
    setCancelError(null);
    load();
  }, [id]);

  function onCancelDone(r: CancelOutcome) {
    if (r.ok) {
      setCancelError(null);
      setCancelled(true);
      setBooking(r.booking);
    } else {
      setCancelError(r.error); // 400 / 409 / 422: show the server's message and reload the booking
      load();
    }
  }

  const back =
    user?.role === "ADVISOR" ? <Link to="/schedule">Back to my schedule</Link> : <Link to="/bookings">Back to my bookings</Link>;

  return (
    <main className="container py-4">
      {confirmed && booking && !cancelled && <div className="alert alert-success" role="status">Booking confirmed.</div>}
      {moved && booking && !cancelled && <div className="alert alert-success" role="status">Booking moved.</div>}
      {cancelled && <div className="alert alert-success" role="status">Booking cancelled.</div>}
      {cancelError && <div className="alert alert-danger" role="alert">{cancelError}</div>}
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
            {advisorCancelNote(booking) && (
              <>
                <dt className="col-sm-3">Reason</dt>
                <dd className="col-sm-9">{advisorCancelNote(booking)}</dd>
              </>
            )}
          </dl>
          {user?.role === "STUDENT" && booking.status === "Upcoming" && (
            <div className="d-flex flex-wrap gap-2 align-items-start">
              {/* F-14 section 5: Reschedule next to Cancel; the server decides BR-15. */}
              <Link to={`/slots?reschedule=${booking.id}`} className="btn btn-outline-primary">Reschedule</Link>
              <CancelBooking id={booking.id} onDone={onCancelDone} />
            </div>
          )}
          {user?.role === "ADVISOR" && booking.status === "Upcoming" && <AdvisorCancelBooking id={booking.id} onDone={onCancelDone} />}
        </>
      )}
      <p className="mt-3">{back}</p>
    </main>
  );
}
