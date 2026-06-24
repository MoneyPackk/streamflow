import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { moviesApi } from "../services/api";
import Grid from "../components/layout/Grid";
import type { Movie } from "../types";

export default function Browse() {
  const navigate = useNavigate();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState("");
  const [sort, setSort] = useState("popularity");

  useEffect(() => {
    const params: Record<string, string> = {};
    if (genre) params.genre = genre;
    if (sort) params.sort = sort;
    moviesApi.list(params).then(setMovies).catch(console.error);
  }, [genre, sort]);

  const handleSearch = () => {
    if (search.trim()) navigate(`/search?q=${encodeURIComponent(search.trim())}`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        <div className="flex-1 flex gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search movies..."
            className="flex-1 bg-card border border-zinc-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-primary transition-colors"
          />
          <button onClick={handleSearch} className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600 transition-colors">
            Search
          </button>
        </div>
        <select
          value={genre}
          onChange={(e) => setGenre(e.target.value)}
          className="bg-card border border-zinc-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-primary"
        >
          <option value="">All Genres</option>
          <option value="action">Action</option>
          <option value="comedy">Comedy</option>
          <option value="drama">Drama</option>
          <option value="horror">Horror</option>
          <option value="sci-fi">Sci-Fi</option>
          <option value="thriller">Thriller</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="bg-card border border-zinc-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-primary"
        >
          <option value="popularity">Popular</option>
          <option value="rating">Top Rated</option>
          <option value="year">Newest</option>
        </select>
      </div>

      {movies.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <p className="text-lg">No movies found</p>
        </div>
      ) : (
        <Grid
          movies={movies}
          renderItem={(movie) => (
            <div
              key={movie.id}
              onClick={() => navigate(`/movie/${movie.id}`)}
              className="bg-card rounded-lg overflow-hidden hover:ring-1 hover:ring-primary/30 transition-all cursor-pointer"
            >
              <img src={movie.poster_path} alt={movie.title} className="w-full aspect-[2/3] object-cover" />
              <div className="p-2.5">
                <h3 className="text-sm font-medium truncate">{movie.title}</h3>
                <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                  <span>{movie.year}</span>
                  <span className="text-yellow-500">★ {movie.rating.toFixed(1)}</span>
                </div>
              </div>
            </div>
          )}
        />
      )}
    </div>
  );
}
