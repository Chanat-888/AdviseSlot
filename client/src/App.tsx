import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, homeFor, RequireLogin, useAuth } from "./auth";
import { Login } from "./Login";

// Placeholder landing pages. The real /slots (F-08) and /schedule (F-05) come in later features.
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
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/slots" element={<RequireLogin><Placeholder title="Slots" /></RequireLogin>} />
          <Route path="/schedule" element={<RequireLogin><Placeholder title="My schedule" /></RequireLogin>} />
          <Route path="*" element={<RequireLogin><Home /></RequireLogin>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
