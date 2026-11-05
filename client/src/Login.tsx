import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ApiError } from "./api";
import { homeFor, useAuth } from "./auth";

export function Login() {
  const { user, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) return <Navigate to={homeFor(user)} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errors: { email?: string; password?: string } = {};
    if (email.trim() === "") errors.email = "Email is required.";
    if (password === "") errors.password = "Password is required.";
    setFieldErrors(errors);
    setError(null);
    if (errors.email || errors.password) return;

    setSubmitting(true);
    try {
      const me = await signIn(email, password);
      navigate(homeFor(me), { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
      setPassword(""); // keep the email, clear the password
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="container py-5" style={{ maxWidth: 420 }}>
      <h1 className="mb-4">AdviseSlot</h1>
      <form onSubmit={onSubmit} noValidate>
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        <div className="mb-3">
          <label htmlFor="email" className="form-label">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            className={`form-control${fieldErrors.email ? " is-invalid" : ""}`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {fieldErrors.email && <div className="invalid-feedback">{fieldErrors.email}</div>}
        </div>
        <div className="mb-3">
          <label htmlFor="password" className="form-label">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className={`form-control${fieldErrors.password ? " is-invalid" : ""}`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {fieldErrors.password && <div className="invalid-feedback">{fieldErrors.password}</div>}
        </div>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting && <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />}
          Log in
        </button>
      </form>
    </main>
  );
}
