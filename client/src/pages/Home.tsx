import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { moviesApi } from "../services/api";
import HeroCarousel from "../components/movie/HeroCarousel";
import MovieRow from "../components/movie/MovieRow";
import type { Movie } from "../types";

export default function Home() {
  const navigate = useNavigate();
  const [featured, setFeatured] = useState<Movie[]>([]);
  const [trending, setTrending] = useState<Movie[]>([]);
  const [popular, setPopular] = useState<Movie[]>([]);
  const [topRated, setTopRated] = useState<Movie[]>([]);
  const [nowPlaying, setNowPlaying] = useState<Movie[]>([]);
  const [popularShows, setPopularShows] = useState<Movie[]>([]);
  const [topShows, setTopShows] = useState<Movie[]>([]);
  const [airingToday, setAiringToday] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      moviesApi.list({ category: "trending" }),
      moviesApi.list({ category: "popular" }),
      moviesApi.list({ category: "top_rated" }),
      moviesApi.list({ category: "now_playing" }),
      moviesApi.list({ category: "popular", type: "tv" }),
      moviesApi.list({ category: "top_rated", type: "tv" }),
      moviesApi.list({ category: "airing_today" }),
    ])
      .then(([trending, popular, topRated, nowPlaying, popularTv, topRatedTv, airingToday]) => {
        setFeatured(trending);
        setTrending(trending);
        setPopular(popular);
        setTopRated(topRated);
        setNowPlaying(nowPlaying);
        setPopularShows(popularTv);
        setTopShows(topRatedTv);
        setAiringToday(airingToday);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm">Loading Streamora...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <HeroCarousel movies={featured} />
      <div className="pb-12">
        <MovieRow title="Trending Shows" movies={trending} viewAllLink="/browse" />
        <MovieRow title="Popular Movies" movies={popular} viewAllLink="/browse" />
        <MovieRow title="Popular TV Shows" movies={popularShows} viewAllLink="/browse" />
        <MovieRow title="Top Rated" movies={topRated} viewAllLink="/browse" />
        <MovieRow title="Top Rated TV" movies={topShows} viewAllLink="/browse" />
        <MovieRow title="Now Playing" movies={nowPlaying} viewAllLink="/browse" />
        <MovieRow title="Airing Today" movies={airingToday} viewAllLink="/browse" />
      </div>
    </div>
  );
}
