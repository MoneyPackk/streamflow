import type { Movie } from "../../types";

interface Props {
  movies: Movie[];
  itemSize?: string;
  gap?: string;
  renderItem?: (movie: Movie) => React.ReactNode;
}

export default function Grid({ movies, itemSize = "160px", gap = "12px", renderItem }: Props) {
  return (
    <div
      className="grid"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${itemSize}, 1fr))`, gap }}
    >
      {movies.map((movie) =>
        renderItem ? (
          renderItem(movie)
        ) : (
          <div key={movie.id} className="bg-card rounded-lg overflow-hidden hover:ring-1 hover:ring-primary/30 transition-all">
            <img src={movie.poster_path} alt={movie.title} className="w-full aspect-[2/3] object-cover" />
            <div className="p-2">
              <h3 className="text-sm font-medium truncate">{movie.title}</h3>
              <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                <span>{movie.year}</span>
                <span className="text-yellow-500">{movie.rating.toFixed(1)}</span>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}
