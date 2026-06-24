import type { Movie, Genre } from "../types";

const API = "/api";

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url);
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
