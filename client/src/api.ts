export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export type User = { id: number; name: string; email: string; role: "STUDENT" | "ADVISOR" };

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

// Sends the sid cookie (credentials: "include") and turns the SDS error shape into an ApiError.
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "The server is not reachable.");
  }
  const body = await res.json().catch(() => null);
  // A 401 on a protected call means the session is gone: send the user to /login (SDS 4.2).
  if (res.status === 401 && body?.error?.code === "UNAUTHENTICATED" && path !== "/api/auth/me") {
    window.location.assign("/login");
  }
  if (!res.ok) {
    throw new ApiError(res.status, body?.error?.code ?? "INTERNAL_ERROR", body?.error?.message ?? "Something went wrong.");
  }
  return body as T;
}
