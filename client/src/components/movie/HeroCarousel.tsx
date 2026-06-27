import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { Movie } from "../../types";

interface Props {
  movies: Movie[];
}

export default function HeroCarousel({ movies }: Props) {
  const [idx, setIdx] = useState(0);
  const navigate = useNavigate();
  const prevLen = useRef(movies.length);

  // Reset idx if movies length changes (stale index guard)
  useEffect(() => {
    if (movies.length !== prevLen.current) {
      setIdx(0);
      prevLen.current = movies.length;
    }
  }, [movies.length]);

  useEffect(() => {
    if (movies.length < 2) return;
    const interval = setInterval(() => setIdx((prev) => (prev + 1) % movies.length), 6000);
    return () => clearInterval(interval);
  }, [movies.length]);

  if (!movies.length) return null;

  const movie = movies[idx];
  const detailPath = `/movie/${movie.id}${movie.is_tv ? '?type=tv' : ''}`;

  return (
    <section className="relative h-[65vh] min-h-[400px] w-full overflow-hidden">
      <img
        src={movie.backdrop_path}
        alt={movie.title}
        className="absolute inset-0 w-full h-full object-cover cursor-pointer"
        onClick={() => navigate(detailPath)}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/70 to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent pointer-events-none" />
      <div className="relative h-full max-w-7xl mx-auto px-4 flex flex-col justify-end pb-20">
        <h1 className="text-4xl md:text-6xl font-display font-bold max-w-2xl">{movie.title}</h1>
        <p className="mt-3 text-muted-foreground max-w-xl line-clamp-2">{movie.synopsis}</p>
        <div className="flex items-center gap-4 mt-4">
          <span className="text-yellow-500 text-sm">★ {movie.rating.toFixed(1)}</span>
          <span className="text-muted-foreground text-sm">{movie.year}</span>
          {movie.is_tv && <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">TV Series</span>}
          {!movie.is_tv && <span className="text-muted-foreground text-sm">{movie.duration}</span>}
          {movie.genres?.slice(0, 3).map((g) => (
            <span key={g} className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">{g}</span>
          ))}
        </div>
        <button
          onClick={() => navigate(`/player/${movie.id}${movie.is_tv ? '?type=tv&season=1&episode=1' : ''}`)}
          className="mt-6 inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-medium hover:bg-emerald-600 transition-colors w-fit"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          Watch Now
        </button>
      </div>
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
        {movies.map((_, i) => (
          <button key={i} onClick={() => setIdx(i)} className={`w-2 h-2 rounded-full transition-all ${i === idx ? "bg-primary w-6" : "bg-zinc-600"}`} />
        ))}
      </div>
    </section>
  );
}
