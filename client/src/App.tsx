import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, NavLink, Route, Routes } from "react-router-dom";
import { AuthProvider, homeFor, RequireLogin, useAuth } from "./auth";
import { api, ApiError } from "./api";
import { BookingDetail } from "./BookingDetail";
import { Bookings } from "./Bookings";
import { History } from "./History";
import { Login } from "./Login";
import { Notifications, useUnreadCount } from "./Notifications";
import { Schedule } from "./Schedule";
import { Slots } from "./Slots";
import { Summary } from "./Summary";

// SDS 4.1: name, role and Logout in the top bar, only when logged in.
function TopBar() {
  const { user, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const unread = useUnreadCount(user?.role === "STUDENT"); // F-19 section 5
  if (!user) return null;
  async function onLogout() {
    setBusy(true);
    try {
      await signOut();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      // TopBar stays mounted while logged out, so reset busy or the next user's Logout stays disabled.
      setBusy(false);
    }
  }
  return (
    <nav className="navbar navbar-light bg-light border-bottom px-3">
      <span className="navbar-brand mb-0 h1">AdviseSlot</span>
      {/* SDS 4.1: the screens of the user's role */}
      <span className="navbar-nav flex-row gap-3 me-auto">
        {user.role === "STUDENT" ? (
          <>
            <NavLink to="/slots" className="nav-link">Slots</NavLink>
            <NavLink to="/bookings" className="nav-link">My bookings</NavLink>
            <NavLink to="/notifications" className="nav-link">
              Notifications
              {unread > 0 && (
                <span className="badge rounded-pill bg-danger ms-1">
                  {unread}
                  <span className="visually-hidden"> unread</span>
                </span>
              )}
            </NavLink>
          </>
        ) : (
          <>
            <NavLink to="/schedule" className="nav-link">Schedule</NavLink>
            <NavLink to="/history" className="nav-link">History</NavLink>
            <NavLink to="/summary" className="nav-link">Summary</NavLink>
          </>
        )}
      </span>
      <span className="d-flex align-items-center gap-3">
        <span>{user.name} ({user.role})</span>
        <button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy} onClick={onLogout}>
          Logout
        </button>
      </span>
    </nav>
  );
}

// Lab 5 (C-06): the running commit, on every page, so a release is visible on the URL.
function Footer() {
  const [commit, setCommit] = useState<string | null>(null);
  useEffect(() => {
    api<{ commit: string }>("/api/version")
      .then((v) => setCommit(v.commit))
      .catch(() => setCommit(null));
  }, []);
  if (!commit) return null;
  return (
    <footer className="text-center text-muted small py-3" data-testid="version">
      AdviseSlot version <code title={commit}>{commit.slice(0, 7)}</code>
    </footer>
  );
}

function Home() {
  const { user } = useAuth();
  return <Navigate to={user ? homeFor(user) : "/login"} replace />;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <TopBar />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/slots" element={<RequireLogin><Slots /></RequireLogin>} />
          <Route path="/bookings" element={<RequireLogin><Bookings /></RequireLogin>} />
          <Route path="/bookings/:id" element={<RequireLogin><BookingDetail /></RequireLogin>} />
          <Route path="/schedule" element={<RequireLogin><Schedule /></RequireLogin>} />
          <Route path="/history" element={<RequireLogin><History /></RequireLogin>} />
          <Route path="/summary" element={<RequireLogin><Summary /></RequireLogin>} />
          <Route path="/notifications" element={<RequireLogin><Notifications /></RequireLogin>} />
          <Route path="*" element={<RequireLogin><Home /></RequireLogin>} />
        </Routes>
        <Footer />
      </AuthProvider>
    </BrowserRouter>
  );
}
