import { auth } from "./firebase/config";

// Base URL of the GymNexus backend (Vercel). Set in the frontend project
// as VITE_API_URL, e.g. https://gymnexus-backend.vercel.app.
// Falls back to the deployed URL so local dev works without an env file.
const API_URL =
  import.meta.env.VITE_API_URL || "https://gymnexus-backend.vercel.app";

export function getApiUrl() {
  return API_URL;
}

// Public health check used for the dashboard's "Backend" status pill.
// Returns "online" | "offline" — never throws.
export async function checkBackendHealth(timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}/api/health`, {
      signal: controller.signal,
    });
    if (!res.ok) return "offline";
    const data = await res.json();
    return data?.ok ? "online" : "offline";
  } catch {
    return "offline";
  } finally {
    clearTimeout(timer);
  }
}

// Authenticated request to the backend. Attaches the signed-in user's
// Firebase ID token so the backend can verify the caller.
export async function apiFetch(path, options = {}) {
  const user = auth.currentUser;
  const token = user ? await user.getIdToken() : null;

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status}).`);
  }

  return res.json();
}
