import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "./api";
import { bangkokDate, bangkokToIso, formatDate, formatTime, isWeekend, START_TIMES } from "./time";

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

// What an Edit or Delete in a row reports to the page: a success text, or the server's message
// and whether the list must be reloaded because the slot changed meanwhile.
type ActionResult = { ok: true; text: string } | { ok: false; error: string; reload: boolean };

// F-12 section 5: Edit turns the row into a date and start-time form, prefilled; Save / Cancel.
// The server decides (F-04 rules, overlap, 404, 409, 422); the form keeps its values on an error.
function EditSlot({ slot, onDone, onClose }: { slot: Slot; onDone: (r: ActionResult) => void; onClose: () => void }) {
  const [date, setDate] = useState(bangkokDate(slot.startAt));
  const [time, setTime] = useState(formatTime(slot.startAt));
  const [busy, setBusy] = useState(false);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (isWeekend(date)) return onDone({ ok: false, error: "Slots can only be on Monday to Friday.", reload: false });
    setBusy(true);
    try {
      const updated = await api<Slot>(`/api/slots/${slot.id}`, {
        method: "PATCH",
        body: JSON.stringify({ startAt: bangkokToIso(date, time) }),
      });
      onDone({ ok: true, text: `Slot updated: ${formatDate(updated.startAt)}, ${formatTime(updated.startAt)}-${formatTime(updated.endAt)}.` });
      onClose();
    } catch (err) {
      // 404, or 409 for a booking made meanwhile: the slot changed, so reload (F-12 section 5).
      const reload = err instanceof ApiError && (err.status === 404 || err.code === "SLOT_HAS_ACTIVE_BOOKING");
      onDone({ ok: false, error: message(err), reload });
      if (reload) onClose();
      setBusy(false);
    }
  }

  return (
    <form className="ms-auto d-flex align-items-center gap-2" onSubmit={onSave} noValidate>
      <label className="visually-hidden" htmlFor={`edit-date-${slot.id}`}>New date</label>
      <input id={`edit-date-${slot.id}`} type="date" className="form-control form-control-sm" value={date} onChange={(e) => setDate(e.target.value)} />
      <label className="visually-hidden" htmlFor={`edit-time-${slot.id}`}>New start time</label>
      <select id={`edit-time-${slot.id}`} className="form-select form-select-sm" value={time} onChange={(e) => setTime(e.target.value)}>
        {START_TIMES.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      <button type="submit" className="btn btn-sm btn-primary" disabled={busy || !date}>
        {busy && <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />}
        Save
      </button>
      <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose} disabled={busy}>
        Cancel
      </button>
    </form>
  );
}

// Edit (F-12) and Delete (F-13) on an Open or Closed row. While editing, Delete is hidden.
function SlotActions({ slot, onDone }: { slot: Slot; onDone: (r: ActionResult) => void }) {
  const [editing, setEditing] = useState(false);
  if (editing) return <EditSlot slot={slot} onDone={onDone} onClose={() => setEditing(false)} />;
  return (
    <span className="ms-auto d-flex align-items-center gap-2">
      <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setEditing(true)}>
        Edit
      </button>
      <DeleteSlot slot={slot} onDone={onDone} />
    </span>
  );
}

// F-13 section 5: Delete on an Open or Closed row, confirmed inline with Delete / Cancel.
// The server decides (404, 409, 422); the button is only shown where a delete can succeed.
function DeleteSlot({ slot, onDone }: { slot: Slot; onDone: (r: ActionResult) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    setBusy(true);
    try {
      await api<void>(`/api/slots/${slot.id}`, { method: "DELETE" });
      onDone({ ok: true, text: "Slot deleted." });
    } catch (err) {
      // 404 or 409: the slot changed in the meantime, so the list is reloaded (F-13 section 5).
      const reload = err instanceof ApiError && (err.status === 404 || err.status === 409);
      onDone({ ok: false, error: message(err), reload });
      setBusy(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setConfirming(true)}>
        Delete
      </button>
    );
  }
  return (
    <span className="d-flex align-items-center gap-2">
      <span>Delete the slot on {formatDate(slot.startAt)}, {formatTime(slot.startAt)}-{formatTime(slot.endAt)}?</span>
      <button type="button" className="btn btn-sm btn-danger" onClick={onDelete} disabled={busy}>
        {busy && <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />}
        Delete
      </button>
      <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setConfirming(false)} disabled={busy}>
        Cancel
      </button>
    </span>
  );
}

// F-05 section 5: own slots grouped by date, with D-24 status badges.
function SlotList({ slots, onAction }: { slots: Slot[]; onAction: (r: ActionResult) => void }) {
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
                {(s.status === "Open" || s.status === "Closed") && <SlotActions slot={s} onDone={onAction} />}
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
  const [notice, setNotice] = useState<{ kind: "success" | "danger"; text: string } | null>(null);

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
      {notice && (
        <div className={`alert alert-${notice.kind}`} role={notice.kind === "success" ? "status" : "alert"}>
          {notice.text}
        </div>
      )}
      {slots && (
        <SlotList
          slots={slots}
          onAction={(r) => {
            if (r.ok) {
              setNotice({ kind: "success", text: r.text });
              load();
            } else {
              setNotice({ kind: "danger", text: r.error });
              if (r.reload) load();
            }
          }}
        />
      )}
    </main>
  );
}
