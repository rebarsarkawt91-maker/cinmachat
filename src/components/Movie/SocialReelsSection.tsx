import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Facebook, Play, Youtube } from "lucide-react";
import type { Movie } from "../../types";

type ReelPlatform = "youtube" | "facebook";

interface SocialReelsSectionProps {
  movies: Movie[];
  youtubeUrl?: string;
  facebookUrl?: string;
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
}: SocialReelsSectionProps) {
  const [platform, setPlatform] = useState<ReelPlatform>("youtube");
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

        {reels.length > 0 ? (
          <div className="relative px-4 py-4 md:px-6">
            <div ref={railRef} className="flex snap-x snap-mandatory gap-3 overflow-x-auto no-scrollbar">
              {reels.map(({ movie, url }) => {
                const id = youtubeId(url);
                const image = id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : movie.image;
                return (
                  <a
                    key={`${platform}-${movie.id}`}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative aspect-video w-[78vw] max-w-[270px] shrink-0 snap-start overflow-hidden rounded-2xl border border-white/10 bg-[#111318] sm:w-[310px]"
                    aria-label={`${movie.title} — ${platform === "youtube" ? "یوتیوب" : "فەیسبووک"}`}
                  >
                    <img
                      src={image || undefined}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-transparent" />
                    <span className="absolute inset-0 m-auto flex h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-black/65 text-white backdrop-blur-sm transition group-hover:scale-110 group-hover:bg-brand-primary">
                      <Play className="h-5 w-5 fill-current" />
                    </span>
                    <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3">
                      <span className="line-clamp-1 text-right text-sm font-black text-white kurdish-text">
                        {movie.title}
                      </span>
                      <PlatformIcon className="h-4 w-4 shrink-0 text-brand-primary" />
                    </div>
                  </a>
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
    </section>
  );
}
