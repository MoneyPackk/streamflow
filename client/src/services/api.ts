import type { Movie, Genre } from "../types";

const API = "/api";

async function json<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json();
}

export const moviesApi = {
  list: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return json<Movie[]>(`${API}/movies${q}`);
  },
  get: (id: number | string) => json<Movie>(`${API}/movies/${id}`),
  search: (query: string) => json<Movie[]>(`${API}/search?q=${encodeURIComponent(query)}`),
  stream: (tmdbId: number | string, type: "movie" | "tv" = "movie") =>
    json<{ url: string }>(`${API}/stream/${tmdbId}?type=${type}`),
  genres: () => json<Genre[]>(`${API}/genres`),
};

export interface Plan {
  id: string;
  name: string;
  price: number;
  currency: string;
  interval: string;
  features: string[];
}

export interface SubscriptionStatus {
  plan: string;
  status: string;
  current_period_end: string | null;
  canceled_at: string | null;
  features: string[];
  max_quality: string;
  max_devices: number;
}

export const subscriptionApi = {
  checkout: (plan_id: string, success_url: string, cancel_url: string) =>
    json<{ url: string }>(`${API}/subscriptions/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan_id, success_url, cancel_url }),
    }),
  portal: () => json<{ url: string }>(`${API}/subscriptions/portal`),
  status: () => json<SubscriptionStatus>(`${API}/subscriptions/status`),
};
