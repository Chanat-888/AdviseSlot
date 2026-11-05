import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "./api";
import { bangkokToIso, formatDate, formatTime, isWeekend, START_TIMES } from "./time";

// The slot shape of F-04 section 4.2 and F-05 section 4.2.
export type Slot = {
  id: number;
  startAt: string;
  endAt: string;
  isLate: boolean;
  bookingDeadline: string;
  status: "Open" | "Booked" | "Closed" | "Passed";
  student: { id: number; name: string } | null;
  bookingId: number | null;
};

const BADGE: Record<Slot["status"], string> = {
  Open: "bg-success",
  Booked: "bg-primary",
  Closed: "bg-secondary",
  Passed: "bg-light text-dark border",
};

const message = (err: unknown) => (err instanceof ApiError ? err.message : "Something went wrong.");

// F-04 section 5: date and start time, then Create.
function CreateSlotForm({ onCreated }: { onCreated: (slot: Slot) => void }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!date || !time) return setError("Choose a date and a start time.");
    if (isWeekend(date)) return setError("Slots can only be on Monday to Friday.");

    setSubmitting(true);
    try {
      const slot = await api<Slot>("/api/slots", {
        method: "POST",
        body: JSON.stringify({ startAt: bangkokToIso(date, time) }),
      });
      setSuccess(`Slot created: ${formatDate(slot.startAt)}, ${formatTime(slot.startAt)}-${formatTime(slot.endAt)}.`);
      onCreated(slot);
    } catch (err) {
      setError(message(err)); // the form keeps its values
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card card-body mb-4" onSubmit={onSubmit} noValidate>
      <h2 className="h5 mb-3">Create a slot</h2>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {success && <div className="alert alert-success" role="status">{success}</div>}
      <div className="row g-3 align-items-end">
        <div className="col-sm-5">
          <label htmlFor="slot-date" className="form-label">Date (Monday to Friday)</label>
          <input id="slot-date" type="date" className="form-control" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="col-sm-4">
          <label htmlFor="slot-time" className="form-label">Start time</label>
          <select id="slot-time" className="form-select" value={time} onChange={(e) => setTime(e.target.value)}>
            <option value="">Choose...</option>
            {START_TIMES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="col-sm-3">
          <button type="submit" className="btn btn-primary w-100" disabled={submitting}>
            {submitting && <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />}
            Create
          </button>
        </div>
      </div>
      <div className="form-text mt-2">Each slot is 30 minutes. Times are Asia/Bangkok.</div>
    </form>
  );
}

// F-05 section 5: own slots grouped by date, with D-24 status badges.
function SlotList({ slots }: { slots: Slot[] }) {
  if (slots.length === 0) return <p className="text-muted">You have no slots yet. Create one above.</p>;

  const groups = new Map<string, Slot[]>();
  for (const s of slots) {
    const key = formatDate(s.startAt);
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }

  return (
    <>
      {[...groups].map(([day, items]) => (
        <section key={day} className="mb-3">
          <h3 className="h6 text-muted">{day}</h3>
          <ul className="list-group">
            {items.map((s) => (
              <li key={s.id} className="list-group-item d-flex align-items-center gap-3">
                <span className="font-monospace">{formatTime(s.startAt)}-{formatTime(s.endAt)}</span>
                <span className={`badge ${BADGE[s.status]}`}>{s.status}</span>
                {s.isLate && <span className="badge text-bg-warning">Late slot</span>}
                {s.student && s.bookingId !== null && (
                  <Link to={`/bookings/${s.bookingId}`} className="ms-auto">{s.student.name}</Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

export function Schedule() {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Slot[]>("/api/slots/mine")
      .then((list) => {
        setSlots(list);
        setError(null);
      })
      .catch((err) => setError(message(err)));
  }, []);

  useEffect(load, [load]);

  return (
    <main className="container py-4">
      <h1 className="mb-4">My schedule</h1>
      <CreateSlotForm onCreated={load} />
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {!error && slots === null && <div className="spinner-border" role="status" />}
      {slots && <SlotList slots={slots} />}
    </main>
  );
}
