import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { moviesApi } from "../services/api";
import { useMovieStore } from "../store/authStore";
import SeasonSelector from "../components/movie/SeasonSelector";
import type { Movie } from "../types";

export default function MovieDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [movie, setMovie] = useState<Movie | null>(null);
  const [loading, setLoading] = useState(true);
  const [season, setSeason] = useState(1);
  const { addToWatchHistory, addToMyList, removeFromMyList, isInMyList } = useMovieStore();

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    moviesApi.get(id).then((m) => {
      setMovie(m);
      addToWatchHistory(m.id);
    }).catch(() => navigate("/")).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex items-center justify-center h-[60vh]"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (!movie) return null;

  const inList = isInMyList(movie.id);
  const cast = movie.cast?.slice(0, 8) || [];

  return (
    <div>
      <div className="relative h-[50vh] min-h-[300px]">
        <img src={movie.backdrop_path} alt={movie.title} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
      </div>

      <div className="max-w-7xl mx-auto px-4 -mt-32 relative z-10 pb-12">
        <div className="flex flex-col md:flex-row gap-8">
          <img src={movie.poster_path} alt={movie.title} className="w-48 md:w-64 rounded-lg shadow-xl" />
          <div className="flex-1">
            <h1 className="text-3xl md:text-4xl font-display font-bold">{movie.title}</h1>
            <div className="flex flex-wrap items-center gap-3 mt-3 text-sm text-muted-foreground">
              <span className="text-yellow-500">★ {movie.rating.toFixed(1)}</span>
              <span>{movie.year}</span>
              <span>{movie.duration}</span>
              <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">{movie.director}</span>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {movie.genres?.map((g) => (
                <span key={g} className="text-xs bg-zinc-800 text-muted-foreground px-2.5 py-1 rounded-full">{g}</span>
              ))}
            </div>
            <p className="mt-4 text-muted-foreground leading-relaxed max-w-2xl">{movie.synopsis}</p>

            <div className="flex flex-wrap gap-3 mt-6">
              <button
                onClick={() => navigate(`/player/${movie.id}`)}
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-lg font-medium hover:bg-emerald-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                Watch Now
              </button>
              <button
                onClick={() => inList ? removeFromMyList(movie.id) : addToMyList(movie.id)}
                className={`px-6 py-2.5 rounded-lg font-medium text-sm transition-colors ${
                  inList ? "bg-primary/20 text-primary" : "bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {inList ? "✓ In My List" : "+ My List"}
              </button>
              <button onClick={() => navigate(-1)} className="px-6 py-2.5 rounded-lg font-medium text-sm bg-card text-muted-foreground hover:text-foreground transition-colors">
                ← Back
              </button>
            </div>

            {movie.is_tv && movie.seasons && (
              <div className="mt-8">
                <h3 className="text-lg font-display font-semibold mb-3">Seasons</h3>
                <SeasonSelector seasons={movie.seasons} selected={season} onSelect={setSeason} />
              </div>
            )}

            {cast.length > 0 && (
              <div className="mt-8">
                <h3 className="text-lg font-display font-semibold mb-3">Cast</h3>
                <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                  {cast.map((c) => (
                    <div key={c.id} className="flex-shrink-0 text-center w-20">
                      <div className="w-16 h-16 rounded-full bg-zinc-700 mx-auto overflow-hidden">
                        {c.profile_path ? (
                          <img src={c.profile_path} alt={c.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">{c.name[0]}</div>
                        )}
                      </div>
                      <p className="text-xs mt-1 truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{c.character}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
