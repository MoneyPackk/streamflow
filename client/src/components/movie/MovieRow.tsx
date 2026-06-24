import { Link } from "react-router-dom";
import type { Movie } from "../../types";
import MovieCard from "./MovieCard";

interface Props {
  title: string;
  movies: Movie[];
  viewAllLink?: string;
}

export default function MovieRow({ title, movies, viewAllLink }: Props) {
  return (
    <section className="py-6">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between mb-4">
        <h2 className="text-xl font-display font-semibold">{title}</h2>
        {viewAllLink && (
          <Link to={viewAllLink} className="text-sm text-primary hover:text-emerald-400 transition-colors">
            View All →
          </Link>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide">
        {movies.map((movie) => (
          <MovieCard key={movie.id} movie={movie} />
        ))}
      </div>
    </section>
  );
}
