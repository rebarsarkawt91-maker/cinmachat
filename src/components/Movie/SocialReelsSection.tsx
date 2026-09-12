import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Facebook, Loader2, Play, Save, Trash2, X, Youtube } from "lucide-react";
import type { Movie } from "../../types";
import {
  addReel,
  fetchReelsFromServer,
  isUsableReelUrl,
  removeReel,
  reelPlatformOf,
  seedReelsFromMovies,
  subscribeReels,
  youtubeIdOf,
  type Reel,
  type ReelPlatform,
} from "../../services/reels";

interface SocialReelsSectionProps {
  movies: Movie[];
  youtubeUrl?: string;
  facebookUrl?: string;
  /** Primary-owner flag: shows the EDIT entry and the per-card remove button. */
  canManage?: boolean;
}

const reelUrlFor = (movie: Movie) =>
  movie.trailerUrl || movie.trailerLink || movie.youtubeMovieUrl || "";

// Merge two reel lists by id, preserving existing order. The server feed and the
// live Firestore subscription may overlap; dedupe so no card renders twice.
const mergeReelLists = (existing: Reel[], incoming: Reel[]): Reel[] => {
  if (!incoming.length) return existing;
  const byId = new Map<string, Reel>();
  for (const reel of existing) byId.set(reel.id, reel);
  let changed = false;
  for (const reel of incoming) {
    if (!byId.has(reel.id)) {
      byId.set(reel.id, reel);
      changed = true;
    }
  }
  return changed ? Array.from(byId.values()) : existing;
};

/**
 * The social-reels shelf. Reels live in their own Firestore collection — the
 * admin pastes a raw link, no movie picker involved. Every card plays its
 * video muted, on loop, as a pure background: the iframe is zoomed and offset
 * so YouTube's own overlays (title, channel, AI chip, control bar) are cropped
 * out of the visible window, and pointer events never reach the player, so no
 * text or logo ever appears on the video. The card itself is the click target
 * (opens the reel) and admins get a hover trash button.
 */
export function SocialReelsSection({
  movies,
  youtubeUrl,
  facebookUrl,
  canManage,
}: SocialReelsSectionProps) {
  const [platform, setPlatform] = useState<ReelPlatform>("youtube");
  const [reels, setReels] = useState<Reel[]>([]);
  const [reelsLoaded, setReelsLoaded] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorUrl, setEditorUrl] = useState("");
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [removingId, setRemovingId] = useState("");
  const railRef = React.useRef<HTMLDivElement>(null);
  // Reel ids whose heavy autoplay iframe has been created. Populated lazily by
  // IntersectionObserver: the row paints lightweight thumbnails first, and the
  // full player only mounts when a card is near/inside the viewport — so page
  // startup never creates N autoplay YouTube players just to show the shelf.
  const mountedReelsRef = React.useRef<Set<string>>(new Set());
  const [mountedReels, setMountedReels] = useState<Set<string>>(() => new Set());

  useEffect(
    () =>
      subscribeReels((list) => {
        setReels(list);
        setReelsLoaded(true);
      }),
    [],
  );

  // Fast initial feed from the server's cached reels mirror. Additive: it never
  // clears live data or flips reelsLoaded, and an empty/missing response is
  // harmless — the section simply keeps waiting on the live Firestore snapshot.
  useEffect(() => {
    let cancelled = false;
    void fetchReelsFromServer().then((list) => {
      if (cancelled) return;
      setReels((prev) => mergeReelLists(prev, list));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // One-time import: when the standalone collection is still empty, copy the
  // trailer links that already exist on movie documents so the shelf survives
  // the migration without the admin re-adding every link by hand.
  useEffect(() => {
    if (!reelsLoaded || reels.length > 0 || movies.length === 0) return;
    const urls = Array.from(
      new Set(
        movies
          .map(reelUrlFor)
          .filter((url) => isUsableReelUrl(url) && reelPlatformOf(url) === platform),
      ),
    ).slice(0, 12);
    if (urls.length > 0) void seedReelsFromMovies(urls);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reelsLoaded, reels.length, movies, platform]);

  const visibleReels = useMemo(
    () => reels.filter((reel) => reel.platform === platform),
    [reels, platform],
  );

  // Mount the heavy autoplay player only for reels that are actually close to
  // the viewport. Cards that have already mounted stay mounted (accumulate) so
  // scrolling back and forth never tears down and recreates players.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const cards = Array.from(rail.querySelectorAll<HTMLElement>("[data-reel-id]"));
    if (cards.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        let added = false;
        const next = new Set(mountedReelsRef.current);
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = entry.target.getAttribute("data-reel-id");
          if (id && !next.has(id)) {
            next.add(id);
            added = true;
          }
        }
        if (added) {
          mountedReelsRef.current = next;
          setMountedReels(next);
        }
      },
      { rootMargin: "300px 0px 300px 0px", threshold: 0.05 },
    );
    cards.forEach((card) => io.observe(card));
    return () => io.disconnect();
  }, [visibleReels, platform]);

  const channelUrl = platform === "youtube" ? youtubeUrl : facebookUrl;
  const PlatformIcon = platform === "youtube" ? Youtube : Facebook;
  const scroll = (direction: number) => {
    railRef.current?.scrollBy({ left: direction * 520, behavior: "smooth" });
  };
  const openEditor = () => {
    setEditorUrl("");
    setEditorError("");
    setEditorOpen(true);
  };
  const saveEditor = async () => {
    const url = editorUrl.trim();
    if (!isUsableReelUrl(url)) {
      setEditorError("تکایە لینکێکی دروست دابنێ");
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
      await addReel(url);
      setEditorOpen(false);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "پاشەکەوتکردن سەرکەوتوو نەبوو");
    } finally {
      setEditorSaving(false);
    }
  };
  const removeReelById = async (reel: Reel) => {
    if (!canManage || removingId) return;
    if (!confirm("ئایا دڵنیایت لە سڕینەوەی ئەم ڕیڵە؟")) return;
    setRemovingId(reel.id);
    try {
      await removeReel(reel.id);
    } finally {
      setRemovingId("");
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
            <Youtube className="h-5 w-5 text-brand-primary" />
            ڕیڵ و ڤیدیۆکانی سینەما چات
          </h2>

          <div className="flex items-center gap-3">
          {canManage && (
            <button
              type="button"
              onClick={openEditor}
              className="flex items-center gap-1 rounded-md border border-red-500/70 bg-black/80 px-2.5 py-1.5 text-[10px] font-black text-white shadow-lg transition-colors hover:bg-red-600"
              aria-label="زیادکردنی ڕیڵ"
            >
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

        {visibleReels.length > 0 ? (
          <div className="relative px-4 py-4 md:px-6">
            <div ref={railRef} className="flex snap-x snap-mandatory gap-3 overflow-x-auto no-scrollbar">
              {visibleReels.map((reel, index) => {
                const id = youtubeIdOf(reel.url);
                const playerMounted = id ? mountedReels.has(reel.id) : true;
                return (
                  <div
                    key={reel.id}
                    data-reel-id={reel.id}
                    className="group relative aspect-video w-[78vw] max-w-[270px] shrink-0 snap-start overflow-hidden rounded-2xl border border-white/10 bg-black sm:w-[310px]"
                  >
                    {id ? (
                      playerMounted ? (
                        <iframe
                          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&controls=0&loop=1&playlist=${id}&playsinline=1&rel=0&iv_load_policy=3&disablekb=1`}
                          title=""
                          loading="lazy"
                          allow="autoplay; encrypted-media"
                          referrerPolicy="strict-origin-when-cross-origin"
                          tabIndex={-1}
                          className="pointer-events-none absolute select-none"
                          style={{ left: "-26%", top: "-37%", width: "160%", height: "160%", border: 0 }}
                        />
                      ) : (
                        <>
                          <img
                            src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
                            alt=""
                            loading={index < 4 ? "eager" : "lazy"}
                            decoding="async"
                            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-90"
                            onError={(event) => {
                              event.currentTarget.style.display = "none";
                            }}
                          />
                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm">
                              <Play
                                className="h-5 w-5 translate-x-[1px]"
                                fill="currentColor"
                              />
                            </span>
                          </div>
                        </>
                      )
                    ) : (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#1a1030] via-[#0b0d14] to-black">
                        <Facebook className="h-10 w-10 text-[#1877F2]/70" />
                      </div>
                    )}
                    <a
                      href={reel.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute inset-0 z-10"
                      aria-label={platform === "youtube" ? "کردنەوەی ڕیڵ لە یوتیوب" : "کردنەوەی ڕیڵ لە فەیسبووک"}
                    />
                    {canManage && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void removeReelById(reel);
                        }}
                        disabled={removingId === reel.id}
                        className="pointer-events-auto absolute bottom-2 left-2 z-20 flex h-6 w-6 items-center justify-center rounded-md border border-red-500/60 bg-black/80 text-red-400 opacity-0 shadow-lg transition-opacity duration-200 hover:bg-red-600 hover:text-white focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-60"
                        aria-label="سڕینەوەی ڕیڵ"
                        title="سڕینەوەی ڕیڵ"
                      >
                        {removingId === reel.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {visibleReels.length > 2 && (
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
            {reelsLoaded && (
              <>
                <PlatformIcon className="h-7 w-7 text-brand-primary" />
                <p className="text-sm font-bold text-gray-400 kurdish-text">
                  هێشتا ڤیدیۆی ئەم بەشە زیاد نەکراوە.
                </p>
              </>
            )}
            {reelsLoaded && isUsableReelUrl(channelUrl) && (
              <a href={channelUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-brand-primary/40 px-4 py-2 text-xs font-black text-white hover:bg-brand-primary kurdish-text">
                کردنەوەی پەڕە
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
        )}
      </div>

      {editorOpen && canManage && (
        <div className="fixed inset-0 z-[100000] grid place-items-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="زیادکردنی ڕیڵ">
          <div className="w-full max-w-lg rounded-3xl border border-red-500/30 bg-[#111318] p-5 text-right shadow-2xl md:p-6">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-lg font-black text-white kurdish-text">زیادکردنی لینکی ڕیڵ</h3>
              <button type="button" onClick={() => setEditorOpen(false)} className="rounded-full border border-white/10 p-2 text-gray-300 hover:bg-white/10" aria-label="داخستن">
                <X className="h-4 w-4" />
              </button>
            </div>
            <label className="mt-5 block text-xs font-black text-gray-300 kurdish-text">
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
            <button type="button" onClick={() => void saveEditor()} disabled={editorSaving} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white hover:bg-red-700 disabled:opacity-50 kurdish-text">
              {editorSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editorSaving ? "پاشەکەوت دەکرێت..." : "پاشەکەوتکردن"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
