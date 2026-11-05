import { useState } from "react";
import { BrowserRouter, Navigate, NavLink, Route, Routes } from "react-router-dom";
import { AuthProvider, homeFor, RequireLogin, useAuth } from "./auth";
import { ApiError } from "./api";
import { BookingDetail } from "./BookingDetail";
import { Bookings } from "./Bookings";
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
      {/* SDS 4.1: the screens of the user's role */}
      <span className="navbar-nav flex-row gap-3 me-auto">
        {user.role === "STUDENT" ? (
          <>
            <NavLink to="/slots" className="nav-link">Slots</NavLink>
            <NavLink to="/bookings" className="nav-link">My bookings</NavLink>
          </>
        ) : (
          <NavLink to="/schedule" className="nav-link">Schedule</NavLink>
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
          <Route path="*" element={<RequireLogin><Home /></RequireLogin>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
