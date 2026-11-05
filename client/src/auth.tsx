import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { api, ApiError, type User } from "./api";

type AuthState = {
  user: User | null;
  loading: boolean; // true until the first GET /api/auth/me has answered
  signIn: (email: string, password: string) => Promise<User>;
};

const AuthContext = createContext<AuthState | null>(null);

export function homeFor(user: User): string {
  return user.role === "ADVISOR" ? "/schedule" : "/slots";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<User>("/api/auth/me")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await api<User>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    const me = await api<User>("/api/auth/me"); // F-01 section 5: call /me after login
    setUser(me);
    return me;
  }, []);

  return <AuthContext.Provider value={{ user, loading, signIn }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

// Route guard: an unauthenticated visit goes to /login.
export function RequireLogin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="container py-5"><div className="spinner-border" role="status" /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export { ApiError };
