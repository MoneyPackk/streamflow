import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { moviesApi } from "../services/api";
import type { Movie } from "../types";

export default function Search() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialQuery = searchParams.get("q") || "";
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<Movie[]>([]);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (initialQuery) {
      moviesApi.search(initialQuery).then(setResults).catch(console.error).then(() => setSearched(true));
    }
  }, [initialQuery]);

  const handleSearch = () => {
    if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex gap-2 mb-8">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="Search movies, shows..."
          className="flex-1 max-w-md bg-card border border-zinc-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-primary transition-colors"
        />
        <button onClick={handleSearch} className="bg-primary text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-600 transition-colors">
          Search
        </button>
      </div>

      {searched && results.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <p className="text-lg">No results for "{initialQuery}"</p>
          <p className="text-sm mt-1">Try a different search term</p>
        </div>
      )}

      {results.length > 0 && (
        <>
          <p className="text-sm text-muted-foreground mb-4">{results.length} result{results.length !== 1 ? "s" : ""} for "{initialQuery}"</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {results.map((movie) => (
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
            ))}
          </div>
        </>
      )}

      {!searched && results.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <svg className="w-12 h-12 mx-auto mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <p>Search for your favorite movies and shows</p>
        </div>
      )}
    </div>
  );
}
