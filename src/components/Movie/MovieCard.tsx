import React from "react";
import {
  Heart,
  ThumbsUp,
  Star,
  Clock,
  Users,
  Radio,
  Play,
  Flame,
} from "lucide-react";
import type { Movie } from "../../types";

/**
 * Enhanced movie card used across the catalog (main grid, trending row,
 * favorites row). Adds live-viewer badges, TOP LIVE highlight, rating/like
 * metrics, duration + release year, and an interactive favorite button —
 * matching the reference card layout.
 */
export interface MovieCardProps {
  movie: Movie;
  /** Current concurrent viewers for this movie (server-computed). */
  liveViewers: number;
  /** True when this movie currently has the most live viewers. */
  isTopLive: boolean;
  /** True when the current user favorited this movie. */
  isFavorite: boolean;
  /** True when the current user liked this movie. */
  isLiked: boolean;
  /** Current like count for this movie. */
  likes: number;
  onOpen: (movie: Movie) => void;
  onToggleFavorite: (movie: Movie) => void;
  onToggleLike: (movie: Movie) => void;
}

/** Formats large counts like 12400 -> "12.4K". */
function formatCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

const FALLBACK_POSTER =
  "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&q=80&w=800";

export const MovieCardBase: React.FC<MovieCardProps> = ({
  movie,
  liveViewers,
  isTopLive,
  isFavorite,
  isLiked,
  likes,
  onOpen,
  onToggleFavorite,
  onToggleLike,
}) => {
  const duration = movie.duration || "";
  const year = movie.year || "";
  const rating = movie.rating || "";

  // Whether this movie has any playable source (mirrors App's getMovieSourceUrl
  // chain) so the hover overlay shows Play/Watch-Now instead of info-only.
  const canPlay = Boolean(
    movie.embedUrl ||
    movie.videoUrl ||
    movie.hdtodayUrl ||
    movie.vidsrcUrl ||
    movie.vidmolyUrl ||
    movie.streamwishUrl ||
    movie.fileLrunUrl ||
    movie.youtubeMovieUrl ||
    movie.otherVideoUrl ||
    movie.streamingUrl ||
    movie.external_link ||
    movie.externalMovieLink,
  );

  // When duration/year are missing, fall back to the publish date so the meta
  // row never looks empty.
  const fallbackDate = movie.date
    ? String(movie.date).split("T")[0]
    : "";
  const metaDate = year || (duration ? "" : fallbackDate);

  const handleFavorite = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleFavorite(movie);
  };

  const handleLike = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleLike(movie);
  };

  return (
    <div
      className="group relative cursor-pointer min-w-0"
      onClick={() => onOpen(movie)}
    >
      {/* Poster */}
      <div className="aspect-[2/3] rounded-2xl overflow-hidden border border-white/10 group-hover:border-brand-primary transition-all relative shadow-2xl group-hover:-translate-y-2 duration-300 bg-black/40">
        <img
          src={movie.image || FALLBACK_POSTER}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            if (target.src !== FALLBACK_POSTER) target.src = FALLBACK_POSTER;
          }}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          alt={movie.title}
        />

        {/* Top-left live stack */}
        <div className="absolute top-2 left-2 flex flex-col items-start gap-1.5 z-10">
          {/* TOP LIVE highlight (only for the movie with the most viewers) */}
          {isTopLive && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg">
              <Radio className="w-2.5 h-2.5 fill-current" />
              <span className="text-[9px] font-black uppercase tracking-wider">
                Top Live
              </span>
            </div>
          )}
          {/* LIVE viewer count */}
          {liveViewers > 0 && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-600/90 text-white shadow-lg">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
              </span>
              <Users className="w-2.5 h-2.5" />
              <span className="text-[9px] font-black tabular-nums">
                {formatCount(liveViewers)}
              </span>
            </div>
          )}
        </div>

        {/* Netflix Original badge */}
        {movie.isNetflixOriginal && (
          <div className="absolute top-2 left-2 w-5 h-8 bg-brand-primary flex items-center justify-center font-black text-sm italic rounded shadow-lg z-10">
            N
          </div>
        )}

        {/* Top-right: favorite button + quality */}
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1.5 z-20">
          <button
            type="button"
            onClick={handleFavorite}
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
            className={`p-1.5 rounded-full backdrop-blur-md border transition-all shadow-lg ${
              isFavorite
                ? "bg-brand-primary border-brand-primary text-white scale-110"
                : "bg-black/60 border-white/10 text-white/80 hover:text-brand-primary hover:border-brand-primary"
            }`}
          >
            <Heart
              className={`w-3.5 h-3.5 ${isFavorite ? "fill-current" : ""}`}
            />
          </button>
          <div className="px-2 py-0.5 bg-black/60 backdrop-blur-md rounded text-[10px] font-black text-white border border-white/10 flex items-center gap-1">
            {movie.quality}
          </div>
        </div>

        {/* Hover play overlay */}
        <div className="absolute inset-0 bg-black/60 flex flex-col justify-center items-center p-4 opacity-0 group-hover:opacity-100 transition-opacity">
          {canPlay ? (
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 bg-brand-primary text-white rounded-full flex items-center justify-center shadow-2xl hover:scale-110 transition-transform">
                <Play className="w-8 h-8 fill-current" />
              </div>
              <button className="bg-brand-primary text-white py-3 px-6 rounded-xl text-sm font-black kurdish-text shadow-xl hover:bg-red-700 transition-colors flex items-center gap-2">
                <Play className="w-4 h-4 fill-current" />
                <span>ئێستا سەیری بکە</span>
              </button>
            </div>
          ) : (
            <div className="bg-brand-primary text-white py-3 px-6 rounded-xl text-sm font-black kurdish-text shadow-lg transform translate-y-4 group-hover:translate-y-0 transition-transform">
              زانیاری فیلم
            </div>
          )}
        </div>
      </div>

      {/* Meta */}
      <div className="mt-3">
        <h3 className="font-bold kurdish-text text-sm group-hover:text-brand-primary transition-colors line-clamp-1">
          {movie.title}
        </h3>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          {rating && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-yellow-500/10 border border-yellow-500/20 rounded-full text-yellow-500 font-bold text-[9px]">
              <Star className="w-2.5 h-2.5 fill-current" />
              {rating}
            </span>
          )}
          <button
            type="button"
            onClick={handleLike}
            aria-label={isLiked ? "Unlike" : "Like"}
            className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border font-bold text-[9px] transition-colors ${
              isLiked
                ? "bg-brand-primary/15 border-brand-primary/40 text-brand-primary"
                : "bg-white/5 border-white/10 text-gray-400 hover:text-brand-primary"
            }`}
          >
            <ThumbsUp className={`w-2.5 h-2.5 ${isLiked ? "fill-current" : ""}`} />
            {formatCount(likes)}
          </button>
          {duration && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-white/5 border border-white/10 rounded-full text-gray-400 font-bold text-[9px]">
              <Clock className="w-2.5 h-2.5" />
              {duration}
            </span>
          )}
          {metaDate && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-white/5 border border-white/10 rounded-full text-gray-400 font-bold text-[9px] uppercase">
              {metaDate}
            </span>
          )}
          {movie.isTrending && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-orange-500 font-black text-[8px] uppercase">
              <Flame className="w-2.5 h-2.5" />
              Trending
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// Memoized so a grid of 100+ cards skips re-render when unrelated app state
// (live-stats poll, sidebar, etc.) changes — only cards whose props actually
// changed (viewer/like counts, favorite/like state) re-render.
export const MovieCard = React.memo(MovieCardBase);

export default MovieCard;
