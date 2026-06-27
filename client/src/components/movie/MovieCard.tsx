import { Link } from "react-router-dom";
import type { Movie } from "../../types";

interface Props {
  movie: Movie;
}

export default function MovieCard({ movie }: Props) {
  return (
    <Link to={`/movie/${movie.id}${movie.is_tv ? '?type=tv' : ''}`} className="group flex-shrink-0 w-[160px]">
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-card">
        <img
          src={movie.poster_path}
          alt={movie.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
          <svg className="w-12 h-12 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>
      <h3 className="mt-2 text-sm font-medium truncate">{movie.title}</h3>
      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
        <span>{movie.year}</span>
        <span className="text-yellow-500">★ {movie.rating.toFixed(1)}</span>
      </div>
    </Link>
  );
}
