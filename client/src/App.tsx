import { useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, homeFor, RequireLogin, useAuth } from "./auth";
import { ApiError } from "./api";
import { Login } from "./Login";
import { Schedule } from "./Schedule";

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

// Placeholder landing page. The real /slots (F-06, F-08) comes in a later feature.
function Placeholder({ title }: { title: string }) {
  const { user } = useAuth();
  return (
    <main className="container py-5">
      <h1 className="mb-3">{title}</h1>
      <p>Logged in as {user?.name} ({user?.role}).</p>
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
          <Route path="/slots" element={<RequireLogin><Placeholder title="Slots" /></RequireLogin>} />
          <Route path="/schedule" element={<RequireLogin><Schedule /></RequireLogin>} />
          <Route path="*" element={<RequireLogin><Home /></RequireLogin>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
