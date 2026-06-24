import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { moviesApi } from "../services/api";

export default function Player() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    moviesApi.stream(id, "movie")
      .then((data) => setStreamUrl(data.url))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-black">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground mt-4 text-sm">Loading stream...</p>
        </div>
      </div>
    );
  }

  if (error || !streamUrl) {
    return (
      <div className="flex items-center justify-center h-screen bg-black">
        <div className="text-center max-w-md">
          <p className="text-red-400 text-lg mb-2">Stream unavailable</p>
          <p className="text-muted-foreground text-sm mb-6">{error || "No stream sources found for this title."}</p>
          <button onClick={() => navigate(-1)} className="bg-primary text-primary-foreground px-6 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600 transition-colors">
            ← Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen bg-black flex flex-col">
      <div className="absolute top-0 left-0 right-0 z-10 p-4 bg-gradient-to-b from-black/80 to-transparent">
        <button onClick={() => navigate(-1)} className="text-white/80 hover:text-white transition-colors inline-flex items-center gap-2 text-sm">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back
        </button>
      </div>

      <video
        ref={videoRef}
        src={streamUrl}
        className="w-full h-full object-contain"
        controls
        autoPlay
        playsInline
      >
        Your browser doesn't support HTML5 video.
      </video>
    </div>
  );
}
