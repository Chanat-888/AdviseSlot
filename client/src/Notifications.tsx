import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "./api";
import { formatDate, formatTime } from "./time";

// F-19 section 4.2 item.
type Notification = {
  id: number;
  message: string;
  createdAt: string;
  readAt: string | null;
  slot: { id: number; startAt: string; endAt: string };
  advisor: { id: number; name: string };
  slotAvailable: boolean;
};

type NotificationList = { unreadCount: number; items: Notification[] };

// F-19 section 5: the top bar refetches its badge when this page changes something.
export const NOTIFICATIONS_CHANGED = "adviseslot:notifications-changed";

/** The student's unread count for the top-bar badge; refetched after login and on NOTIFICATIONS_CHANGED. */
export function useUnreadCount(enabled: boolean): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return setCount(0);
    const load = () =>
      api<NotificationList>("/api/notifications")
        .then((n) => setCount(n.unreadCount))
        .catch(() => setCount(0));
    load();
    window.addEventListener(NOTIFICATIONS_CHANGED, load);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED, load);
  }, [enabled]);
  return count;
}

// F-19 section 5: newest first (the server sorts). Advisor, date and time come from the slot's
// current data, not from `message` (D-32).
export function Notifications() {
  const [items, setItems] = useState<Notification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    api<NotificationList>("/api/notifications")
      .then((n) => setItems(n.items))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Something went wrong."));
  }, []);

  async function markRead(id: number) {
    setBusyId(id);
    setError(null);
    try {
      const updated = await api<Notification>(`/api/notifications/${id}/read`, { method: "POST" });
      setItems((list) => list && list.map((n) => (n.id === id ? updated : n)));
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="container py-4">
      <h1 className="mb-4">Notifications</h1>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {items === null && !error && <div className="spinner-border" role="status" />}
      {items && items.length === 0 && <p className="text-muted">No notifications.</p>}
      {items && items.length > 0 && (
        <ul className="list-group">
          {items.map((n) => (
            <li key={n.id} className={`list-group-item d-flex align-items-center gap-3 flex-wrap${n.readAt ? "" : " fw-bold"}`}>
              <span>Late slot: {n.advisor.name}</span>
              <span>
                {formatDate(n.slot.startAt)}, {formatTime(n.slot.startAt)}-{formatTime(n.slot.endAt)}
              </span>
              {n.slotAvailable ? (
                <Link to="/slots">Book</Link>
              ) : (
                <span className="small text-muted fw-normal">This slot is no longer available.</span>
              )}
              {!n.readAt && (
                <button
                  type="button"
                  className="btn btn-outline-primary btn-sm ms-auto"
                  disabled={busyId === n.id}
                  onClick={() => markRead(n.id)}
                >
                  {busyId === n.id && <span className="spinner-border spinner-border-sm me-1" aria-hidden="true" />}
                  Mark as read
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
