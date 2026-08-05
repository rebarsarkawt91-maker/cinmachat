import React from "react";
import {
  Heart,
  ThumbsUp,
  Star,
  Clock,
  Eye,
  Play,
  Languages,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import type { Movie } from "../../types";

/**
 * Premium movie card used across the whole catalog (home grid, trending row,
 * favorites row, search results, continue watching, related movies). Designed
 * to feel like a modern streaming poster: large rounded poster, dark bottom
 * gradient, live-viewer counters, trending highlight, IMDb + CinemaChat
 * ratings, genre/year/runtime meta, like/favorite actions and quality/language
 * badges — all in one memoized component.
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
export function formatCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

export const FALLBACK_POSTER =
  "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&q=80&w=800";

/** Normalize a string for language/tag matching (case + whitespace folding). */
const norm = (s: string): string =>
  String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

/** Language signals extractable from a movie's own data (tags/category), so the
 *  badge is always data-driven — never invented. `movie.language` (set in the
 *  admin form) wins, otherwise known language tags are matched. */
const LANGUAGE_TAG_MAP: Array<[string[], string]> = [
  [["کوردی", "کوردستان", "dub"], "کوردی"],
  [["ئینگلیزی", "english", "hollywood"], "English"],
  [["عەرەبی", "arabic", "عربي"], "عەرەبی"],
  [["تورکی", "turkish", "تركي"], "تورکی"],
  [["فارسی", "persian", "فارسي"], "فارسی"],
  [["هندی", "hindi", "bollywood", "بۆلیوود"], "هندی"],
  [["کۆری", "korean", "k-drama"], "کۆری"],
  [["ژاپۆنی", "japanese", "anime", "ئەنیمێ"], "ژاپۆنی"],
  [["فەرەنسی", "french"], "فەرەنسی"],
  [["ئیسپانی", "spanish"], "ئیسپانی"],
  [["ئەڵمانی", "german"], "ئەڵمانی"],
  [["ئیتاڵی", "italian"], "ئیتاڵی"],
];

/** Best-effort language label derived entirely from the movie's own data. */
export function inferMovieLanguage(movie: Movie): string {
  if (movie.language && String(movie.language).trim()) return String(movie.language).trim();
  const signals = (Array.isArray(movie.tags) ? movie.tags : [])
    .concat(movie.category ? [movie.category] : [])
    .map((t: any) => norm(String(t)));
  for (const [keys, label] of LANGUAGE_TAG_MAP) {
    if (keys.some((k) => signals.some((s) => s.includes(norm(k))))) return label;
  }
  return "";
}

/** Color scheme for the quality chip (HD / 4K / CAM / ...). */
function qualityChipClass(quality: string): string {
  const q = norm(quality);
  if (q.includes("4k") || q.includes("uhd") || q.includes("8k")) {
    return "bg-gradient-to-r from-fuchsia-600 to-purple-700 border-fuchsia-300/30";
  }
  if (q.includes("cam")) {
    return "bg-gradient-to-r from-red-600 to-orange-600 border-red-300/30";
  }
  if (q.includes("720") || q.includes("480")) {
    return "bg-gradient-to-r from-sky-600 to-cyan-600 border-sky-300/30";
  }
  return "bg-gradient-to-r from-blue-600 to-indigo-600 border-blue-300/30";
}

/** First two genre labels from the movie's tags (skips generic filler). */
function getGenres(movie: Movie): string[] {
  const tags = Array.isArray(movie.tags) ? movie.tags : [];
  const skip = new Set([
    "new releases",
    "فیلمە نوێیەکان",
    "هەمووی",
    "series",
    "trailer",
    "trailers",
  ]);
  return tags
    .filter((t: any) => String(t).trim() && !skip.has(norm(String(t))))
    .slice(0, 3);
}

/** Whether this movie has any playable source (mirrors App's source chain). */
export function movieCanPlay(movie: Movie): boolean {
  return Boolean(
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
}

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
  const imdb = movie.rating || movie.imdbRating || "";
  const ccRating = Number(movie.ccRating) || 0;
  const favoriteCount = Number(movie.favoriteCount) || 0;
  const views = Number(movie.views) || 0;
  const genres = getGenres(movie);
  const language = inferMovieLanguage(movie);
  const quality = movie.quality || "HD";
  const canPlay = movieCanPlay(movie);

  // When duration/year are missing, fall back to the publish date so the meta
  // row never looks empty.
  const fallbackDate = movie.date ? String(movie.date).split("T")[0] : "";
  const metaDate = year || (duration ? "" : fallbackDate);

  const handleFavorite = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleFavorite(movie);
  };

  const handleLike = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleLike(movie);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(movie);
    }
  };

  const handleActionKeyDown = (e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      className="group relative cursor-pointer min-w-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black"
      onClick={() => onOpen(movie)}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`${movie.title}${year ? ` (${year})` : ""}${liveViewers > 0 ? `, ${liveViewers} watching now` : ""}${views > 0 ? `, ${views.toLocaleString()} total views` : ""}`}
    >
      {/* Poster */}
      <div className="relative aspect-[2/3] rounded-2xl overflow-hidden bg-[#0b0b0d] ring-1 ring-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.55)] transition-all duration-300 group-hover:-translate-y-1.5 group-hover:ring-brand-primary/60 group-hover:shadow-[0_22px_60px_-15px_rgba(229,9,20,0.45)]">
        <img
          src={movie.image || FALLBACK_POSTER}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            if (target.src !== FALLBACK_POSTER) target.src = FALLBACK_POSTER;
          }}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.08]"
          alt=""
          aria-hidden="true"
        />

        {/* Dark bottom gradient (premium card signature) */}
        <div className="absolute inset-x-0 bottom-0 h-[70%] bg-gradient-to-t from-black via-black/75 to-transparent pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black to-transparent pointer-events-none" />

        {/* Top-left live stack */}
        <div className="absolute top-2 left-2 flex flex-col items-start gap-1.5 z-10">
          {/* Live now — driven by REAL concurrent viewers (≥1). Solid red so it is
              impossible to miss, with the live count right on the pill. */}
          {liveViewers > 0 && (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand-primary text-white shadow-lg shadow-brand-primary/40 ring-1 ring-white/20"
              title={`${liveViewers} watching now`}
            >
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
              </span>
              <span className="text-[11px] font-black uppercase tracking-wider leading-none">
                Live
              </span>
              <span className="flex items-center gap-0.5 tabular-nums text-[11px] font-black leading-none">
                <Eye className="w-3 h-3" aria-hidden="true" />
                {formatCount(liveViewers)}
              </span>
            </div>
          )}
          {/* Netflix Original monogram */}
          {movie.isNetflixOriginal && (
            <div className="w-5 h-8 bg-brand-primary flex items-center justify-center font-black text-sm italic rounded shadow-lg">
              <span className="sr-only">Netflix Original</span>
              N
            </div>
          )}
        </div>

        {/* Top-right action stack: like + favorite + quality + language */}
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1.5 z-20">
          <div className="flex items-center gap-1.5">
            {/* Favorite */}
            <button
              type="button"
              onClick={handleFavorite}
              onKeyDown={handleActionKeyDown}
              aria-label={
                isFavorite
                  ? `Remove ${movie.title} from favorites`
                  : `Add ${movie.title} to favorites`
              }
              aria-pressed={isFavorite}
              className={`p-1.5 rounded-full backdrop-blur-md border transition-all shadow-lg ${
                isFavorite
                  ? "bg-brand-primary border-brand-primary text-white scale-110"
                  : "bg-black/60 border-white/10 text-white/80 hover:text-brand-primary hover:border-brand-primary"
              }`}
            >
              <Heart
                className={`w-3.5 h-3.5 ${isFavorite ? "fill-current" : ""}`}
                aria-hidden="true"
              />
            </button>
            {/* Like */}
            <button
              type="button"
              onClick={handleLike}
              onKeyDown={handleActionKeyDown}
              aria-label={isLiked ? `Unlike ${movie.title}` : `Like ${movie.title}`}
              aria-pressed={isLiked}
              className={`p-1.5 rounded-full backdrop-blur-md border transition-all shadow-lg ${
                isLiked
                  ? "bg-brand-primary border-brand-primary text-white scale-110"
                  : "bg-black/60 border-white/10 text-white/80 hover:text-brand-primary hover:border-brand-primary"
              }`}
            >
              <ThumbsUp
                className={`w-3.5 h-3.5 ${isLiked ? "fill-current" : ""}`}
                aria-hidden="true"
              />
            </button>
          </div>
          {/* Quality badge (HD / 4K / CAM ...) */}
          <div
            className={`px-2 py-0.5 rounded text-[9px] font-black text-white border flex items-center gap-1 backdrop-blur-md ${qualityChipClass(quality)}`}
          >
            <Sparkles className="w-2.5 h-2.5" aria-hidden="true" />
            {quality}
          </div>
          {/* Language badge */}
          {language && (
            <div className="px-2 py-0.5 rounded text-[9px] font-black text-white bg-black/60 backdrop-blur-md border border-white/10 flex items-center gap-1">
              <Languages className="w-2.5 h-2.5" aria-hidden="true" />
              {language}
            </div>
          )}
        </div>

        {/* Bottom overlay content: title, meta, ratings, actions */}
        <div className="absolute inset-x-0 bottom-0 p-3 z-10 pointer-events-none">
          <h3 className="font-bold kurdish-text text-sm leading-snug text-white line-clamp-1 group-hover:text-brand-primary transition-colors">
            {movie.title}
          </h3>

          {/* Year • Runtime */}
          {(metaDate || duration) && (
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[9px] font-semibold text-gray-400">
              {metaDate && <span className="uppercase">{metaDate}</span>}
              {metaDate && duration && (
                <span aria-hidden="true" className="text-gray-600">•</span>
              )}
              {duration && (
                <span className="flex items-center gap-0.5">
                  <Clock className="w-2.5 h-2.5" aria-hidden="true" />
                  {duration}
                </span>
              )}
            </div>
          )}

          {/* Genres */}
          {genres.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1 overflow-hidden">
              {genres.map((g) => (
                <span
                  key={g}
                  className="px-1.5 py-px rounded bg-white/10 border border-white/10 text-[8px] font-bold text-gray-300 kurdish-text"
                >
                  {g}
                </span>
              ))}
            </div>
          )}

          {/* IMDb + CinemaChat ratings + counts */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {imdb && (
              <span
                className="flex items-center gap-0.5 px-1.5 py-0.5 bg-yellow-500/15 border border-yellow-500/30 rounded-full text-yellow-400 font-black text-[9px]"
                title={`IMDb ${imdb}`}
              >
                <Star className="w-2.5 h-2.5 fill-current" aria-hidden="true" />
                {imdb}
                <span className="text-[7px] font-bold text-yellow-400/70">
                  IMDb
                </span>
              </span>
            )}
            {ccRating > 0 && (
              <span
                className="flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-500/15 border border-emerald-500/30 rounded-full text-emerald-400 font-black text-[9px]"
                title={`CinemaChat rating (${movie.ratingCount || 0} ratings)`}
              >
                <Star className="w-2.5 h-2.5 fill-current" aria-hidden="true" />
                {ccRating.toFixed(1)}
                <span className="text-[7px] font-bold text-emerald-400/70">
                  CC
                </span>
              </span>
            )}
            {(likes > 0 || isLiked) && (
              <span
                className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border font-bold text-[9px] ${
                  isLiked
                    ? "bg-brand-primary/25 border-brand-primary/40 text-brand-primary"
                    : "bg-white/10 border-white/10 text-gray-300"
                }`}
              >
                <ThumbsUp className={`w-2.5 h-2.5 ${isLiked ? "fill-current" : ""}`} aria-hidden="true" />
                {formatCount(likes)}
              </span>
            )}
            {favoriteCount > 0 && (
              <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-rose-500/15 border border-rose-500/25 rounded-full text-rose-300 font-bold text-[9px]">
                <Heart className="w-2.5 h-2.5 fill-current" aria-hidden="true" />
                {formatCount(favoriteCount)}
              </span>
            )}
          </div>

          {/* Live viewers + lifetime views counters — real, server-computed.
              "Watching Now" only appears while people are actually watching;
              "Views" is always shown on every card. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {liveViewers > 0 && (
              <span
                className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-300 font-bold text-[9px]"
                title={`${liveViewers} watching now`}
              >
                <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-400" />
                </span>
                <Eye className="w-2.5 h-2.5" aria-hidden="true" />
                <span className="tabular-nums">{formatCount(liveViewers)}</span>
                <span className="text-[7px] font-bold text-red-300/70">
                  Watching Now
                </span>
              </span>
            )}
            <span
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/10 border border-white/10 text-gray-200 font-bold text-[9px]"
              title={`${views.toLocaleString()} total views`}
            >
              <TrendingUp className="w-2.5 h-2.5" aria-hidden="true" />
              <span className="tabular-nums">{views.toLocaleString()}</span>
              <span className="text-[7px] font-bold text-gray-400">Views</span>
            </span>
          </div>
        </div>

        {/* Hover play overlay */}
        <div
          className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/40 flex flex-col justify-center items-center p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 pointer-events-none"
          aria-hidden="true"
        >
          <div className="w-14 h-14 bg-white/15 backdrop-blur-xl border border-white/30 text-white rounded-full flex items-center justify-center shadow-2xl group-hover:bg-brand-primary group-hover:border-brand-primary transition-all duration-300">
            <Play className="w-7 h-7 fill-current translate-x-0.5" />
          </div>
          <span className="mt-3 text-xs font-black kurdish-text text-white drop-shadow-lg">
            {canPlay ? "ئێستا سەیری بکە" : "زانیاری فیلم"}
          </span>
        </div>
      </div>
    </div>
  );
};

// Memoized so a grid of 100+ cards skips re-render when unrelated app state
// (live-stats poll, sidebar, etc.) changes — only cards whose props actually
// changed (viewer/like counts, favorite/like state) re-render.
export const MovieCard = React.memo(MovieCardBase);

/** Skeleton placeholder matching the card's aspect ratio, used while the
 *  catalog loads so the grid never flashes empty. */
export const MovieCardSkeleton: React.FC<{ className?: string }> = ({
  className = "",
}) => {
  return (
    <div
      className={`min-w-0 ${className}`}
      aria-hidden="true"
    >
      <div className="relative aspect-[2/3] rounded-2xl overflow-hidden bg-white/5 ring-1 ring-white/5 animate-pulse">
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-3 inset-x-3 space-y-2">
          <div className="h-3 w-3/4 rounded bg-white/10" />
          <div className="h-2 w-1/2 rounded bg-white/10" />
          <div className="h-2 w-2/3 rounded bg-white/10" />
        </div>
      </div>
    </div>
  );
};

export default MovieCard;
