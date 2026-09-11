import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Edit3, ExternalLink, Facebook, Loader2, Play, Save, Trash2, X, Youtube } from "lucide-react";
import type { Movie } from "../../types";

type ReelPlatform = "youtube" | "facebook";

interface SocialReelsSectionProps {
  movies: Movie[];
  youtubeUrl?: string;
  facebookUrl?: string;
  onSaveReel?: (movie: Movie, url: string) => Promise<void>;
  onRemoveReel?: (movie: Movie, url: string) => Promise<void>;
}

const isUsableUrl = (value?: string) => {
  if (!value || value === "#") return false;
  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

const youtubeId = (value?: string) => {
  if (!value) return null;
  const match = value.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i,
  );
  return match?.[1] || null;
};

const reelUrlFor = (movie: Movie) =>
  movie.trailerUrl || movie.trailerLink || movie.youtubeMovieUrl || "";

/**
 * A light, additive social-reels shelf. It reuses published movie trailers and
 * existing channel settings; no third-party iframe is loaded until a user
 * deliberately opens a reel.
 */
export function SocialReelsSection({
  movies,
  youtubeUrl,
  facebookUrl,
  onSaveReel,
  onRemoveReel,
}: SocialReelsSectionProps) {
  const [platform, setPlatform] = useState<ReelPlatform>("youtube");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMovieId, setEditorMovieId] = useState("");
  const [editorUrl, setEditorUrl] = useState("");
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [removingId, setRemovingId] = useState("");
  const railRef = React.useRef<HTMLDivElement>(null);

  const reels = useMemo(
    () =>
      movies
        .map((movie) => ({ movie, url: reelUrlFor(movie) }))
        .filter(({ url }) => {
          if (!isUsableUrl(url)) return false;
          return platform === "youtube"
            ? /youtube\.com|youtu\.be/i.test(url)
            : /facebook\.com|fb\.watch/i.test(url);
        })
        .slice(0, 12),
    [movies, platform],
  );

  const channelUrl = platform === "youtube" ? youtubeUrl : facebookUrl;
  const PlatformIcon = platform === "youtube" ? Youtube : Facebook;
  const scroll = (direction: number) => {
    railRef.current?.scrollBy({ left: direction * 520, behavior: "smooth" });
  };
  const openEditor = () => {
    const first = movies[0];
    setEditorMovieId(first?.id || "");
    setEditorUrl(first ? reelUrlFor(first) : "");
    setEditorError("");
    setEditorOpen(true);
  };
  const removeReel = async (movie: Movie, url: string) => {
    if (!onRemoveReel || removingId) return;
    if (!confirm(`ئایا دڵنیایت لە سڕینەوەی ڕیڵی "${movie.title}"؟`)) return;
    setRemovingId(movie.id);
    try {
      await onRemoveReel(movie, url);
    } finally {
      setRemovingId("");
    }
  };
  const chooseEditorMovie = (movieId: string) => {
    const movie = movies.find((item) => item.id === movieId);
    setEditorMovieId(movieId);
    setEditorUrl(movie ? reelUrlFor(movie) : "");
    setEditorError("");
  };
  const saveEditor = async () => {
    const movie = movies.find((item) => item.id === editorMovieId);
    const url = editorUrl.trim();
    if (!movie || !isUsableUrl(url)) {
      setEditorError("تکایە فیلمێک و لینکێکی دروست هەڵبژێرە");
      return;
    }
    const validPlatform = platform === "youtube"
      ? /youtube\.com|youtu\.be/i.test(url)
      : /facebook\.com|fb\.watch/i.test(url);
    if (!validPlatform) {
      setEditorError(platform === "youtube" ? "لینکی یوتیوب دابنێ" : "لینکی فەیسبووک دابنێ");
      return;
    }
    setEditorSaving(true);
    setEditorError("");
    try {
      await onSaveReel?.(movie, url);
      setEditorOpen(false);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "پاشەکەوتکردن سەرکەوتوو نەبوو");
    } finally {
      setEditorSaving(false);
    }
  };

  return (
    <section
      aria-labelledby="cinemachat-reels-title"
      dir="rtl"
      className="mx-auto mb-10 max-w-7xl px-8"
    >
      <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#090a0d]/95 shadow-2xl shadow-black/30">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-5 py-4 md:px-7">
          <h2
            id="cinemachat-reels-title"
            className="flex items-center gap-3 text-xl font-black text-white kurdish-text md:text-2xl"
          >
            <Play className="h-5 w-5 fill-brand-primary text-brand-primary" />
            ڕیڵ و ڤیدیۆکانی سینەما چات
          </h2>

          <div className="flex items-center gap-3">
          {onSaveReel && (
            <button
              type="button"
              onClick={openEditor}
              className="flex items-center gap-1 rounded-md border border-red-500/70 bg-black/80 px-2.5 py-1.5 text-[10px] font-black text-white shadow-lg transition-colors hover:bg-red-600"
              aria-label="دەستکاریکردنی ڕیڵەکان"
            >
              <Edit3 className="h-3.5 w-3.5" />
              EDIT
            </button>
          )}
          <div className="flex rounded-full border border-brand-primary/40 bg-white/[0.04] p-1" role="tablist">
            {(
              [
                { id: "youtube", label: "یوتیوب", icon: Youtube },
                { id: "facebook", label: "فەیسبووک", icon: Facebook },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={platform === tab.id}
                onClick={() => setPlatform(tab.id)}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-black transition-colors kurdish-text md:px-5 ${
                  platform === tab.id
                    ? "bg-brand-primary text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>
          </div>
        </div>

        {reels.length > 0 ? (
          <div className="relative px-4 py-4 md:px-6">
            <div ref={railRef} className="flex snap-x snap-mandatory gap-3 overflow-x-auto no-scrollbar">
              {reels.map(({ movie, url }) => {
                const id = youtubeId(url);
                const image = id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : movie.image;
                return (
                  <div
                    key={`${platform}-${movie.id}`}
                    className="group relative aspect-video w-[78vw] max-w-[270px] shrink-0 snap-start overflow-hidden rounded-2xl border border-white/10 bg-[#111318] sm:w-[310px]"
                  >
                    {id ? (
                      <iframe
                        src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&controls=0&loop=1&playlist=${id}&playsinline=1&modestbranding=1&rel=0&iv_load_policy=3`}
                        title={movie.title}
                        loading="lazy"
                        allow="autoplay; encrypted-media"
                        referrerPolicy="strict-origin-when-cross-origin"
                        className="pointer-events-none absolute inset-0 h-full w-full"
                      />
                    ) : (
                      <img
                        src={image || undefined}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                      />
                    )}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute inset-0 z-10"
                      aria-label={`${movie.title} — ${platform === "youtube" ? "یوتیوب" : "فەیسبووک"}`}
                    />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-3 p-3">
                      <span className="line-clamp-1 text-right text-sm font-black text-white kurdish-text">
                        {movie.title}
                      </span>
                      {onRemoveReel ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void removeReel(movie, url);
                          }}
                          disabled={removingId === movie.id}
                          className="pointer-events-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-red-500/60 bg-black/80 text-red-400 shadow-lg transition-colors hover:bg-red-600 hover:text-white disabled:opacity-60"
                          aria-label={`سڕینەوەی ڕیڵی ${movie.title}`}
                          title="سڕینەوەی ڕیڵ"
                        >
                          {removingId === movie.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      ) : (
                        <PlatformIcon className="pointer-events-none h-4 w-4 shrink-0 text-brand-primary" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {reels.length > 2 && (
              <div className="mt-3 hidden justify-end gap-2 md:flex" dir="ltr">
                <button type="button" onClick={() => scroll(-1)} aria-label="پێشوو" className="rounded-full border border-white/10 bg-white/5 p-2 text-white hover:bg-brand-primary">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => scroll(1)} aria-label="دواتر" className="rounded-full border border-white/10 bg-white/5 p-2 text-white hover:bg-brand-primary">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-8 text-center">
            <PlatformIcon className="h-7 w-7 text-brand-primary" />
            <p className="text-sm font-bold text-gray-400 kurdish-text">
              هێشتا ڤیدیۆی ئەم بەشە زیاد نەکراوە.
            </p>
            {isUsableUrl(channelUrl) && (
              <a href={channelUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-brand-primary/40 px-4 py-2 text-xs font-black text-white hover:bg-brand-primary kurdish-text">
                کردنەوەی پەڕە
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
        )}
      </div>

      {editorOpen && onSaveReel && (
        <div className="fixed inset-0 z-[100000] grid place-items-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="دەستکاریکردنی ڕیڵەکان">
          <div className="w-full max-w-lg rounded-3xl border border-red-500/30 bg-[#111318] p-5 text-right shadow-2xl md:p-6">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-lg font-black text-white kurdish-text">زیادکردنی لینکی ڕیڵ</h3>
              <button type="button" onClick={() => setEditorOpen(false)} className="rounded-full border border-white/10 p-2 text-gray-300 hover:bg-white/10" aria-label="داخستن">
                <X className="h-4 w-4" />
              </button>
            </div>
            <label className="mt-5 block text-xs font-black text-gray-300 kurdish-text">فیلم هەڵبژێرە</label>
            <select value={editorMovieId} onChange={(event) => chooseEditorMovie(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none focus:border-red-500">
              {movies.map((movie) => <option key={movie.id} value={movie.id}>{movie.title}</option>)}
            </select>
            <label className="mt-4 block text-xs font-black text-gray-300 kurdish-text">
              {platform === "youtube" ? "لینکی ڤیدیۆی یوتیوب" : "لینکی ڕیڵی فەیسبووک"}
            </label>
            <input
              type="url"
              value={editorUrl}
              onChange={(event) => setEditorUrl(event.target.value)}
              placeholder={platform === "youtube" ? "https://youtu.be/..." : "https://www.facebook.com/reel/..."}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-left text-sm text-white outline-none focus:border-red-500"
              dir="ltr"
            />
            {editorError && <p className="mt-3 text-xs font-bold text-red-400 kurdish-text">{editorError}</p>}
            <button type="button" onClick={() => void saveEditor()} disabled={editorSaving || !editorMovieId} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white hover:bg-red-700 disabled:opacity-50 kurdish-text">
              {editorSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editorSaving ? "پاشەکەوت دەکرێت..." : "پاشەکەوتکردن"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
