import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { moviesApi } from "../services/api";
import Grid from "../components/layout/Grid";
import type { Movie } from "../types";

export default function Browse() {
  const navigate = useNavigate();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [search, setSearch] = useState("");
  const [mediaType, setMediaType] = useState<"movie" | "tv">("movie");
  const [genre, setGenre] = useState("");
  const [sort, setSort] = useState("popularity");

  useEffect(() => {
    const params: Record<string, string> = { type: mediaType };
    if (genre) params.genre = genre;
    if (sort === "rating") params.sort = sort;
    else params.category = sort === "trending" ? "trending" : "popular";
    moviesApi.list(params).then(setMovies).catch(console.error);
  }, [mediaType, genre, sort]);

  const handleSearch = () => {
    if (search.trim()) navigate(`/search?q=${encodeURIComponent(search.trim())}`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex flex-wrap gap-2 sm:gap-3 mb-8 items-center">
        <div className="flex-1 flex gap-2 min-w-0">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search..."
            className="flex-1 min-w-0 bg-card border border-zinc-700 rounded-lg px-3 sm:px-4 py-2 text-sm focus:outline-none focus:border-primary transition-colors"
          />
          <button onClick={handleSearch} className="bg-primary text-primary-foreground px-3 sm:px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600 transition-colors shrink-0">
            Search
          </button>
        </div>

        {/* Movies / TV toggle */}
        <div className="flex bg-card border border-zinc-700 rounded-lg overflow-hidden">
          <button
            onClick={() => setMediaType("movie")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              mediaType === "movie" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Movies
          </button>
          <button
            onClick={() => setMediaType("tv")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              mediaType === "tv" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            TV Shows
          </button>
        </div>

        <select
          value={genre}
          onChange={(e) => setGenre(e.target.value)}
          className="bg-card border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
        >
          <option value="">All Genres</option>
          <option value="28">Action</option>
          <option value="35">Comedy</option>
          <option value="18">Drama</option>
          <option value="27">Horror</option>
          <option value="878">Sci-Fi</option>
          <option value="53">Thriller</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="bg-card border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
        >
          <option value="popularity">Popular</option>
          <option value="trending">Trending</option>
          <option value="rating">Top Rated</option>
        </select>
      </div>

      {movies.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <p className="text-lg">No {mediaType === "movie" ? "movies" : "TV shows"} found</p>
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
                  {movie.is_tv && <span className="text-primary">TV</span>}
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
