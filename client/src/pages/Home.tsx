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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      moviesApi.list({ featured: "true" }),
      moviesApi.list({ trending: "true" }),
    ])
      .then(([f, t]) => {
        setFeatured(f);
        setTrending(t);
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
        <MovieRow title="Trending Now" movies={trending} viewAllLink="/browse" />
        <MovieRow title="Popular Movies" movies={featured.slice(0, 10)} viewAllLink="/browse" />
      </div>
    </div>
  );
}
