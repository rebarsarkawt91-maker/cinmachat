import React, { useEffect, useMemo, useState } from "react";
import { Edit3, Loader2, Save, X } from "lucide-react";
import type { Movie } from "../../types";

type EditableMovie = Movie & Record<string, any>;

interface MovieEditModalProps {
  movie: EditableMovie | null;
  onClose: () => void;
  onSave: (movie: EditableMovie) => Promise<void>;
}

const TEXT_FIELDS: Array<{ key: string; label: string; placeholder?: string }> = [
  { key: "title", label: "ناوی فیلم" },
  { key: "posterUrl", label: "لینکی وێنە (Poster URL)" },
  { key: "streamingUrl", label: "لینکی سەرەکی فیلم" },
  { key: "hdtodayUrl", label: "HDToday URL" },
  { key: "vidsrcUrl", label: "VidSrc URL" },
  { key: "vidmolyUrl", label: "Vidmoly URL" },
  { key: "streamwishUrl", label: "StreamWish URL" },
  { key: "fileLrunUrl", label: "FileLrun URL" },
  { key: "youtubeMovieUrl", label: "YouTube Movie URL" },
  { key: "otherVideoUrl", label: "لینکی ڤیدیۆی تر" },
  { key: "trailerUrl", label: "Trailer URL" },
  { key: "mainTrailerUrl", label: "Main Trailer URL" },
  { key: "subtitleUrl", label: "ژێرنووسی سەرچاوە (VTT/SRT URL)" },
  { key: "kurdishSubtitleUrl", label: "Kurdish VTT URL (کوردی سۆرانی)" },
  { key: "imdbUrl", label: "IMDb URL" },
  { key: "rating", label: "IMDb Rating" },
  { key: "year", label: "ساڵ" },
  { key: "duration", label: "ماوە" },
  { key: "quality", label: "کوالێتی" },
  { key: "language", label: "زمان" },
  { key: "whatsappLink", label: "WhatsApp URL" },
  { key: "externalMovieLink", label: "External Movie URL" },
];

export default function MovieEditModal({ movie, onClose, onSave }: MovieEditModalProps) {
  const [draft, setDraft] = useState<EditableMovie | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!movie) return;
    setDraft({
      ...movie,
      posterUrl: movie.posterUrl || movie.image || "",
      streamingUrl:
        movie.streamingUrl || movie.videoUrl || movie.external_link || "",
      category: movie.category || movie.tags?.[0] || "",
      tagsText: Array.isArray(movie.tags) ? movie.tags.join(", ") : "",
      subtitleText: movie.subtitleText || "",
      kurdishSubtitleUrl: movie.kurdishSubtitleUrl || "",
    });
    setError("");
  }, [movie]);

  const canSave = useMemo(() => Boolean(draft?.title?.trim()) && !saving, [draft, saving]);
  if (!movie || !draft) return null;

  const setField = (key: string, value: string) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError("");
    try {
      const tags = String(draft.tagsText || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      await onSave({ ...draft, tags, image: draft.posterUrl || "" });
      onClose();
    } catch (err: any) {
      setError(err?.message || "پاشەکەوتکردن سەرکەوتوو نەبوو");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/90 p-3 backdrop-blur-xl" role="dialog" aria-modal="true" aria-labelledby="movie-edit-title">
      <form onSubmit={submit} className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-red-500/30 bg-[#101014] p-5 shadow-2xl md:p-8" dir="rtl">
        <div className="sticky top-0 z-10 mb-6 flex items-center justify-between rounded-2xl border border-white/10 bg-[#101014]/95 p-4 backdrop-blur-xl">
          <div>
            <h2 id="movie-edit-title" className="flex items-center gap-2 text-xl font-black text-white kurdish-text"><Edit3 className="h-5 w-5 text-red-500" /> دەستکاریکردنی فیلم</h2>
            <p className="mt-1 text-xs text-gray-400 kurdish-text">خانەی بەتاڵ بە بەتاڵی پاشەکەوت دەکرێت.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-white/10 p-2 text-gray-300 hover:bg-white/10" aria-label="داخستن"><X className="h-5 w-5" /></button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {TEXT_FIELDS.map(({ key, label, placeholder }) => (
            <label key={key} className="space-y-2 text-xs font-bold text-gray-300 kurdish-text">
              <span>{label}</span>
              <input
                value={String(draft[key] ?? "")}
                onChange={(event) => setField(key, event.target.value)}
                placeholder={placeholder}
                className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-white outline-none transition-colors focus:border-red-500"
              />
            </label>
          ))}
          <label className="space-y-2 text-xs font-bold text-gray-300 kurdish-text">
            <span>پۆلێن</span>
            <input value={String(draft.category ?? "")} onChange={(event) => setField("category", event.target.value)} className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-white outline-none focus:border-red-500" />
          </label>
          <label className="space-y-2 text-xs font-bold text-gray-300 kurdish-text">
            <span>تاگەکان (بە کۆما جیابکەرەوە)</span>
            <input value={String(draft.tagsText ?? "")} onChange={(event) => setField("tagsText", event.target.value)} className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-white outline-none focus:border-red-500" />
          </label>
        </div>

        <label className="mt-4 block space-y-2 text-xs font-bold text-gray-300 kurdish-text">
          <span>وەسفی فیلم</span>
          <textarea value={String(draft.description ?? "")} onChange={(event) => setField("description", event.target.value)} rows={4} className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-white outline-none focus:border-red-500" />
        </label>
        <label className="mt-4 block space-y-2 text-xs font-bold text-gray-300 kurdish-text">
          <span>دەقی ژێرنووس (VTT/SRT)</span>
          <textarea value={String(draft.subtitleText ?? "")} onChange={(event) => setField("subtitleText", event.target.value)} rows={8} dir="auto" spellCheck={false} className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 font-mono text-sm text-white outline-none focus:border-red-500" />
        </label>

        {error && <p role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm font-bold text-red-300 kurdish-text">{error}</p>}
        <div className="mt-6 flex gap-3">
          <button type="submit" disabled={!canSave} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-3 font-black text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50 kurdish-text">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "پاشەکەوت دەکرێت..." : "جێگیرکردنی گۆڕانکارییەکان"}
          </button>
          <button type="button" onClick={onClose} className="rounded-xl border border-white/10 px-5 py-3 font-bold text-gray-300 hover:bg-white/10 kurdish-text">پاشگەزبوونەوە</button>
        </div>
      </form>
    </div>
  );
}
