import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { streamApi, moviesApi } from "../services/api";
import { useAuthStore } from "../store/authStore";
import type { StreamResult } from "../services/api";
import type { Movie } from "../types";

interface EmbedSource {
  id: number;
  load_url: string;
}

export default function Player() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const subscription = useAuthStore((s) => s.subscription);

  const isSubscribed =
    subscription?.status === "active" || subscription?.status === "trialing";

  const [stream, setStream] = useState<StreamResult | null>(null);
  const [movie, setMovie] = useState<Movie | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Preview state
  const [previewExpired, setPreviewExpired] = useState(false);
  const [previewTimeLeft, setPreviewTimeLeft] = useState<number | null>(null);
  const previewEndRef = useRef<number | null>(null);

  // Embed fallback state
  const [embedSources, setEmbedSources] = useState<EmbedSource[]>([]);
  const [currentEmbed, setCurrentEmbed] = useState(0);
  const [useEmbed, setUseEmbed] = useState(false);
  const [embedError, setEmbedError] = useState(false);
  const [embedsLoading, setEmbedsLoading] = useState(false);

  const type = (searchParams.get("type") as "movie" | "tv") || "movie";
  const season = searchParams.get("season") ? parseInt(searchParams.get("season")!) : undefined;
  const episode = searchParams.get("episode") ? parseInt(searchParams.get("episode")!) : undefined;

  // Fetch stream + movie details
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);

    Promise.all([
      streamApi.get(id, type, season, episode),
      moviesApi.get(id, type).catch(() => null),
    ])
      .then(([streamData, movieData]) => {
        setStream(streamData);
        setMovie(movieData);

        // If stream says preview but user is subscribed, try TorBox again
        // (the stream route checks JWT subscription, but if client-side shows
        // subscribed, the stream route may have a stale JWT — force reload)
        if (streamData.preview && isSubscribed) {
          // Re-fetch stream — the backend should see the subscription now
          streamApi.get(id, type, season, episode).then((retryData) => {
            setStream(retryData);
          });
          return;
        }

        // Try embed sources as fallback when no stream URL is available
        if (!streamData.url) {
          setEmbedsLoading(true);
          let embedUrl = `/api/embed/${id}?type=${type}`;
          if (season !== undefined && episode !== undefined) {
            embedUrl += `&season=${season}&episode=${episode}`;
          }
          fetch(embedUrl)
            .then((r) => r.json())
            .then((data) => {
              if (data.sources?.length) {
                setEmbedSources(data.sources);
                setUseEmbed(true);
              }
            })
            .catch(() => {})
            .finally(() => setEmbedsLoading(false));
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, type, season, episode]);

  // Set up preview timer
  useEffect(() => {
    if (!stream?.preview || !stream.duration_seconds || isSubscribed) return;

    previewEndRef.current = stream.duration_seconds;
    setPreviewTimeLeft(stream.duration_seconds);
    setPreviewExpired(false);

    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      const remaining = Math.max(
        0,
        Math.ceil((previewEndRef.current || 300) - video.currentTime)
      );
      setPreviewTimeLeft(remaining);

      if (remaining <= 0) {
        video.pause();
        setPreviewExpired(true);
      }
    };

    const onSeeked = () => {
      // Don't allow seeking past the preview window
      if (video.currentTime > (previewEndRef.current || 300)) {
        video.currentTime = previewEndRef.current || 300;
      }
    };

    const onSeeking = () => {
      // Block seeking beyond preview on scrub attempt
      if (video.currentTime > (previewEndRef.current || 300)) {
        video.currentTime = previewEndRef.current || 300;
      }
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("seeking", onSeeking);

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("seeking", onSeeking);
    };
  }, [stream?.preview, stream?.duration_seconds, isSubscribed]);

  // Embed source cycling
  const nextEmbed = useCallback(() => {
    setEmbedError(false);
    setCurrentEmbed((i) => (i + 1) % embedSources.length);
  }, [embedSources.length]);

  // Format countdown
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // --- Loading state ---
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-black">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-zinc-400 mt-4 text-sm">Loading stream...</p>
        </div>
      </div>
    );
  }

  // --- Error / unavailable state ---
  if ((error || (!stream?.available && !stream?.url && !useEmbed)) && !embedsLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-black">
        <div className="text-center max-w-md px-4">
          <svg className="w-16 h-16 mx-auto mb-4 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <p className="text-red-400 text-lg mb-1">Stream unavailable</p>
          <p className="text-zinc-400 text-sm mb-6">{error || stream?.reason || "No stream sources found for this title."}</p>
          <button onClick={() => navigate(-1)} className="bg-emerald-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-500 transition-colors">
            ← Go Back
          </button>
        </div>
      </div>
    );
  }

  // --- Embed fallback mode ---
  if (useEmbed && embedSources.length > 0) {
    const src = embedSources[currentEmbed];
    return (
      <div className="relative h-screen bg-black flex flex-col">
        <div className="absolute top-0 left-0 right-0 z-10 p-4 bg-gradient-to-b from-black/80 to-transparent">
          <div className="flex items-center justify-between">
            <button onClick={() => navigate(-1)} className="text-white/80 hover:text-white transition-colors inline-flex items-center gap-2 text-sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              Back
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400">
                Source {currentEmbed + 1} of {embedSources.length}
              </span>
              <button onClick={nextEmbed} className="text-white/60 hover:text-white text-xs bg-white/10 px-2.5 py-1 rounded transition-colors">
                Switch
              </button>
            </div>
          </div>
        </div>

        <iframe
          key={src.load_url}
          src={src.load_url}
          className="w-full h-full"
          allow="autoplay; encrypted-media; fullscreen"
          allowFullScreen
          onError={() => setEmbedError(true)}
        />

        {embedError && currentEmbed < embedSources.length - 1 && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-center">
              <p className="text-zinc-300 mb-4">Source failed to load</p>
              <button onClick={nextEmbed} className="bg-emerald-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-500 transition-colors">
                Try Next Source
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- Preview expired overlay ---
  const previewDuration = stream?.duration_seconds || 300;
  const showSubscribeOverlay = previewExpired && !isSubscribed;

  return (
    <div className="relative h-screen bg-black flex flex-col">
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-20 p-4 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
        <div className="flex items-center justify-between pointer-events-auto">
          <button onClick={() => navigate(-1)} className="text-white/80 hover:text-white transition-colors inline-flex items-center gap-2 text-sm">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back
          </button>

          {/* Preview countdown badge */}
          {stream?.preview && !isSubscribed && !previewExpired && previewTimeLeft !== null && (
            <div className="flex items-center gap-2 bg-yellow-500/20 border border-yellow-500/40 rounded-full px-3 py-1 pointer-events-auto">
              <svg className="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span className="text-yellow-300 text-xs font-medium tabular-nums">
                Preview: {formatTime(previewTimeLeft)}
              </span>
            </div>
          )}

          {/* Subscribed badge */}
          {isSubscribed && (
            <div className="bg-emerald-500/20 border border-emerald-500/40 rounded-full px-3 py-1 pointer-events-auto">
              <span className="text-emerald-300 text-xs font-medium">Full access</span>
            </div>
          )}
        </div>
      </div>

      {/* Movie title + quality badge */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-4 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
        <div className="flex items-end justify-between pointer-events-auto">
          <div>
            {movie && (
              <h1 className="text-white text-lg font-semibold drop-shadow-lg">{movie.title}</h1>
            )}
            {stream?.quality && (
              <span className="text-zinc-300 text-xs">{stream.quality}p</span>
            )}
          </div>
        </div>
      </div>

      {/* Video player */}
      <video
        ref={videoRef}
        src={stream?.url || undefined}
        className="w-full h-full object-contain"
        controls={!showSubscribeOverlay}
        autoPlay
        playsInline
      >
        Your browser doesn't support HTML5 video.
      </video>

      {/* Subscribe overlay — blocks the player */}
      {showSubscribeOverlay && (
        <div className="absolute inset-0 z-30 bg-black/90 flex items-center justify-center p-6">
          <div className="text-center max-w-sm">
            {/* Lock icon */}
            <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>

            <h2 className="text-white text-xl font-bold mb-2">Preview Ended</h2>
            <p className="text-zinc-400 text-sm mb-1">
              You watched {formatTime(previewDuration)} of preview.
            </p>
            <p className="text-zinc-400 text-sm mb-6">
              Subscribe to unlock the full movie in HD.
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => navigate("/pricing")}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-6 rounded-lg transition-colors text-sm"
              >
                See Plans & Pricing
              </button>
              <button
                onClick={() => navigate(-1)}
                className="text-zinc-400 hover:text-white text-sm transition-colors"
              >
                Go Back
              </button>
            </div>

            {/* Feature list */}
            <div className="mt-6 space-y-2 text-left">
              {[
                "Watch full movies in HD",
                "No time limits or ads",
                "Cancel anytime",
              ].map((feature) => (
                <div key={feature} className="flex items-center gap-2 text-zinc-300 text-xs">
                  <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {feature}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
