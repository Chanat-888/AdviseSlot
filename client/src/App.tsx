import { useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { AuthProvider, homeFor, RequireLogin, useAuth } from "./auth";
import { ApiError } from "./api";
import { Login } from "./Login";
import { Schedule } from "./Schedule";
import { Slots } from "./Slots";

// SDS 4.1: name, role and Logout in the top bar, only when logged in.
function TopBar() {
  const { user, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  async function onLogout() {
    setBusy(true);
    try {
      await signOut();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }
  return (
    <nav className="navbar navbar-light bg-light border-bottom px-3">
      <span className="navbar-brand mb-0 h1">AdviseSlot</span>
      <span className="d-flex align-items-center gap-3">
        <span>{user.name} ({user.role})</span>
        <button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy} onClick={onLogout}>
          Logout
        </button>
      </span>
    </nav>
  );
}

// Stand-in for the booking detail screen (F-09, Issue #12), which replaces it. It only shows
// the confirmation that F-07 section 5 asks for.
function BookingPlaceholder() {
  const { id } = useParams();
  const confirmed = (useLocation().state as { confirmed?: boolean } | null)?.confirmed;
  return (
    <main className="container py-4">
      {confirmed && <div className="alert alert-success" role="status">Booking confirmed.</div>}
      <h1 className="h4">Booking {id}</h1>
    </main>
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
          <Route path="/bookings/:id" element={<RequireLogin><BookingPlaceholder /></RequireLogin>} />
          <Route path="/schedule" element={<RequireLogin><Schedule /></RequireLogin>} />
          <Route path="*" element={<RequireLogin><Home /></RequireLogin>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
