export interface Movie {
  id: number;
  tmdb_id: number;
  title: string;
  poster_path: string;
  backdrop_path: string;
  synopsis: string;
  year: number;
  rating: number;
  duration: string;
  genres: string[];
  director: string;
  cast: CastMember[];
  trailer_url?: string;
  is_tv: boolean;
  seasons?: Season[];
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path?: string;
}

export interface Season {
  id: number;
  number: number;
  title: string;
  episode_count: number;
}

export interface Episode {
  id: number;
  number: number;
  title: string;
  synopsis: string;
  runtime: number;
}

export interface Genre {
  id: number;
  name: string;
}
