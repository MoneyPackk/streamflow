import type { Movie, Genre } from "../types";

const API = "/api";

async function json<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json();
}

interface TmdbResponse {
  items?: any[];
  page?: number;
}

function mapTmdbItem(item: any): Movie {
  return {
    id: item.tmdb_id || item.id,
    tmdb_id: item.tmdb_id || item.id,
    title: item.title || item.name || '',
    poster_path: item.poster_url || item.poster_path || '',
    backdrop_path: item.backdrop_url || item.backdrop_path || '',
    synopsis: item.description || item.overview || '',
    year: item.release_year || (item.release_date ? parseInt(item.release_date.split('-')[0]) : 0) || 0,
    rating: item.vote_average || 0,
    duration: item.runtime ? `${item.runtime}m` : item.episode_run_time?.[0] ? `${item.episode_run_time[0]}m` : '',
    genres: item.genres || (item.genre ? item.genre.split(', ') : []),
    cast: item.cast || [],
    director: item.director || '',
    is_tv: item.type === 'tv',
    seasons: item.seasons || undefined,
  };
}

export const moviesApi = {
  list: (params?: Record<string, string>) => {
    const cat = params?.category || '';
    const mediaType = params?.type || 'movie';
    if (cat === 'trending') {
      return json<TmdbResponse>(`${API}/tmdb/trending`)
        .then(r => (r.items || []).map(mapTmdbItem));
    }
    if (cat === 'popular') {
      return json<TmdbResponse>(`${API}/tmdb/popular?type=${mediaType}`)
        .then(r => (r.items || []).map(mapTmdbItem));
    }
    if (cat === 'top_rated') {
      return json<TmdbResponse>(`${API}/tmdb/top_rated?type=${mediaType}`)
        .then(r => (r.items || []).map(mapTmdbItem));
    }
    if (cat === 'now_playing') {
      return json<TmdbResponse>(`${API}/tmdb/now_playing`)
        .then(r => (r.items || []).map(mapTmdbItem));
    }
    if (cat === 'airing_today') {
      return json<TmdbResponse>(`${API}/tmdb/airing_today`)
        .then(r => (r.items || []).map(mapTmdbItem));
    }
    if (cat === 'on_the_air') {
      return json<TmdbResponse>(`${API}/tmdb/on_the_air`)
        .then(r => (r.items || []).map(mapTmdbItem));
    }
    if (params?.trending === 'true' || params?.featured === 'true') {
      return json<TmdbResponse>(`${API}/tmdb/trending`)
        .then(r => (r.items || []).map(mapTmdbItem));
    }
    if (params?.sort === 'rating') {
      return json<TmdbResponse>(`${API}/tmdb/top_rated?type=movie`)
        .then(r => (r.items || []).map(mapTmdbItem));
    }
    if (params?.genre) {
      return json<TmdbResponse>(`${API}/tmdb/discover?type=movie&with_genres=${params.genre}`)
        .then(r => (r.items || []).map(mapTmdbItem));
    }
    return json<TmdbResponse>(`${API}/tmdb/popular?type=movie`)
      .then(r => (r.items || []).map(mapTmdbItem));
  },
  get: async (id: number | string) => {
    // Try movie first, then tv
    const data = await json<any>(`${API}/tmdb/${id}?type=movie`).catch(() =>
      json<any>(`${API}/tmdb/${id}?type=tv`)
    );
    return mapTmdbItem(data);
  },
  search: (query: string) =>
    json<TmdbResponse>(`${API}/tmdb/search?q=${encodeURIComponent(query)}`)
      .then(r => (r.items || []).map(mapTmdbItem)),
  stream: (tmdbId: number | string, type: "movie" | "tv" = "movie") =>
    json<StreamResult>(`${API}/stream/${tmdbId}?type=${type}`),
  genres: () => json<{ id: number; name: string }[]>(`${API}/tmdb/genres?type=movie`),
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

export interface StreamResult {
  url?: string;
  available: boolean;
  preview?: boolean;
  duration_seconds?: number;
  quality?: number;
  name?: string;
  reason?: string;
}

export const streamApi = {
  get: (tmdbId: number | string, type: "movie" | "tv" = "movie", season?: number, episode?: number) => {
    let url = `${API}/stream/${tmdbId}?type=${type}`;
    if (season !== undefined) url += `&season=${season}`;
    if (episode !== undefined) url += `&episode=${episode}`;
    return json<StreamResult>(url);
  },
};
