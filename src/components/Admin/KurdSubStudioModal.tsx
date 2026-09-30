import React, { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileText, Loader2, Pause, Play, Sparkles, Subtitles, Upload, Wand2, X } from "lucide-react";
import { parseSubtitleCues, type SubtitleCue } from "../../hooks/useSubtitleManager";
import type { Movie } from "../../types";

type StudioCue = SubtitleCue & { id: string };

interface KurdSubStudioModalProps {
  movies: Movie[];
  onClose: () => void;
  onApply: (movieId: string, subtitleText: string) => Promise<void>;
}

const STUDIO_DB = "kurdish_sub_studio_db";
const STUDIO_STORE = "projects";

function cueId(cue: SubtitleCue, index: number) {
  return `${index}-${cue.start}-${cue.end}`;
}

function toStudioCues(source: string): StudioCue[] {
  return parseSubtitleCues(source).map((cue, index) => ({ ...cue, id: cueId(cue, index) }));
}

function formatTimestamp(seconds: number, separator: "." | ",") {
  const totalMilliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const wholeSeconds = Math.floor((totalMilliseconds % 60_000) / 1_000);
  const milliseconds = totalMilliseconds % 1_000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}${separator}${String(milliseconds).padStart(3, "0")}`;
}

function cueTiming(cue: SubtitleCue, asSrt = false) {
  const separator = asSrt ? "," : ".";
  return `${formatTimestamp(cue.start, separator)} --> ${formatTimestamp(cue.end, separator)}`;
}

function exportSubtitle(cues: StudioCue[], asSrt: boolean) {
  const body = cues.map((cue, index) => `${asSrt ? `${index + 1}\n` : ""}${cueTiming(cue, asSrt)}\n${cue.text}`).join("\n\n");
  return asSrt ? `\uFEFF${body}\n` : `WEBVTT\n\n${body}\n`;
}

function downloadText(content: string, fileName: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function openStudioDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(STUDIO_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STUDIO_STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveProject(project: Record<string, unknown>) {
  const db = await openStudioDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STUDIO_STORE, "readwrite");
    tx.objectStore(STUDIO_STORE).put(project);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export default function KurdSubStudioModal({ movies, onClose, onApply }: KurdSubStudioModalProps) {
  const [source, setSource] = useState("");
  const [cues, setCues] = useState<StudioCue[]>([]);
  const [selectedMovieId, setSelectedMovieId] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredCues = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? cues.filter((cue) => cue.text.toLowerCase().includes(needle)) : cues;
  }, [cues, query]);
  const selectedMovie = movies.find((movie) => movie.id === selectedMovieId);
  const projectId = selectedMovieId || source.slice(0, 120) || "draft";

  useEffect(() => {
    if (!cues.length) return;
    const timer = window.setTimeout(() => {
      void saveProject({ id: projectId, source, cues, selectedMovieId, updatedAt: new Date().toISOString() }).catch(() => {});
    }, 500);
    return () => window.clearTimeout(timer);
  }, [cues, projectId, selectedMovieId, source]);

  const setSubtitleText = (text: string) => {
    try {
      const parsed = toStudioCues(text);
      if (!parsed.length) throw new Error("No valid subtitle cues found");
      setCues(parsed);
      setMessage(`${parsed.length} ڕستە دۆزرایەوە`);
    } catch (error: any) {
      setMessage(error?.message || "فایلی ژێرنووس نادروستە");
    }
  };

  const loadFromUrl = async () => {
    const value = source.trim();
    const imdbId = value.match(/tt\d{7,10}/i)?.[0]?.toLowerCase();
    const matchedMovie = movies.find((movie: any) =>
      imdbId
        ? String(movie.imdbId || movie.imdbUrl || "").toLowerCase().includes(imdbId)
        : value && [movie.videoUrl, movie.streamingUrl, movie.embedUrl, movie.youtubeMovieUrl, movie.otherVideoUrl]
          .some((url) => String(url || "").trim() === value),
    );
    if (matchedMovie) {
      setSelectedMovieId(matchedMovie.id);
      if (matchedMovie.subtitleText || matchedMovie.subtitleUrl) {
        if (matchedMovie.subtitleText) setSubtitleText(matchedMovie.subtitleText);
        else setSource(matchedMovie.subtitleUrl || value);
      }
      setMessage(`فیلمی «${matchedMovie.title}» دۆزرایەوە. ${matchedMovie.subtitleText ? "ژێرنووسی پاشەکەوتکراو بارکرا." : "فایل یان لینکی ژێرنووس دابنێ."}`);
      if (matchedMovie.subtitleText) return;
    }
    if (!/^https?:\/\//i.test(value)) {
      setMessage("تکایە لینکی http(s)، IMDb ID، یان فایلی SRT/VTT دیاری بکە.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      // A YouTube watch/embed URL needs caption discovery, not a raw HTTP
      // download. The server route handles the provider-specific extraction
      // and returns the original timestamp-preserving SRT.
      if (/(?:youtu\.be\/|(?:www\.)?youtube\.com\/)/i.test(value)) {
        const response = await fetch("/api/subtitle/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: value, lang: "original" }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result?.srt) throw new Error(result?.error || "YouTube subtitles could not be discovered");
        setSubtitleText(result.srt);
        return;
      }
      const response = await fetch(`/api/subtitle/remote?url=${encodeURIComponent(value)}`);
      const text = await response.text();
      if (!response.ok) throw new Error(text || "Subtitle source could not be loaded");
      setSubtitleText(text);
    } catch (error: any) {
      setMessage(error?.message || "هێنانی ژێرنووس سەرکەوتوو نەبوو");
    } finally {
      setBusy(false);
    }
  };

  const importFile = async (file?: File) => {
    if (!file) return;
    if (!/\.(srt|vtt)$/i.test(file.name)) {
      setMessage("تەنها فایلی SRT یان VTT ڕێگەپێدراوە.");
      return;
    }
    setSource(file.name);
    setSubtitleText(await file.text());
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    void importFile(event.dataTransfer.files?.[0]);
  };

  const translateToSorani = async (singleCue?: StudioCue) => {
    const target = singleCue ? [singleCue] : cues;
    if (!target.length) return;
    setBusy(true);
    setPaused(false);
    setMessage("");
    try {
      // The server preserves timestamps/tags and internally batches Gemini work.
      const payload = exportSubtitle(target, false);
      const response = await fetch("/api/subtitles/auto-translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vttText: payload, movieId: selectedMovieId || undefined, targetLang: "ckb", sourceLang: "auto", force: true }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.srt) throw new Error(result?.error || "Gemini translation failed");
      const translated = toStudioCues(result.srt);
      if (singleCue) {
        const replacement = translated[0];
        if (replacement) setCues((current) => current.map((cue) => cue.id === singleCue.id ? { ...cue, text: replacement.text } : cue));
      } else if (!paused) {
        setCues(translated);
      }
      setMessage(result.warning || "وەرگێڕانی سۆرانی تەواو بوو");
    } catch (error: any) {
      setMessage(error?.message || "وەرگێڕان سەرکەوتوو نەبوو");
    } finally {
      setBusy(false);
    }
  };

  const applyToMovie = async () => {
    if (!selectedMovieId || !cues.length) {
      setMessage("تکایە فیلم و ژێرنووس هەڵبژێرە.");
      return;
    }
    setBusy(true);
    try {
      await onApply(selectedMovieId, exportSubtitle(cues, false));
      setMessage("ژێرنووس بە سەرکەوتوویی جێگیرکرا لەسەر فیلمەکە.");
    } catch (error: any) {
      setMessage(error?.message || "جێگیرکردنی ژێرنووس سەرکەوتوو نەبوو");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100300] flex items-center justify-center bg-black/90 p-3 backdrop-blur-xl" role="dialog" aria-modal="true" aria-labelledby="kurdsub-studio-title">
      <div className="flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-3xl border border-amber-400/30 bg-[#0d1527] shadow-2xl" dir="rtl">
        <header className="flex items-center justify-between border-b border-white/10 bg-[#101b32] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-amber-400 p-2 text-black"><Subtitles className="h-5 w-5" /></div>
            <div><h2 id="kurdsub-studio-title" className="font-black text-white kurdish-text">ستۆدیۆی ژێرنووسی کوردی — KurdSub Studio</h2><p className="text-xs text-slate-400">Analyze · edit · translate · export · apply</p></div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-300 hover:bg-white/10" aria-label="داخستن"><X className="h-5 w-5" /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-4">
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-black text-white kurdish-text">سەرچاوە و شیکردنەوەی لینک</h3><span className="text-xs text-slate-400">IMDb · Embed · MP4 · HLS · YouTube · SRT/VTT</span></div>
            <div className="flex flex-col gap-2 md:flex-row">
              <input value={source} onChange={(event) => setSource(event.target.value)} placeholder="https://…  |  tt1234567  |  subtitle URL" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none focus:border-amber-400" dir="ltr" />
              <button type="button" onClick={loadFromUrl} disabled={busy} className="rounded-xl bg-amber-400 px-4 py-3 text-sm font-black text-black disabled:opacity-50 kurdish-text">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "شیکردنەوە / هێنان"}</button>
              <button type="button" onClick={() => inputRef.current?.click()} className="flex items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm font-black text-white kurdish-text"><Upload className="h-4 w-4" /> فایل</button>
              <input ref={inputRef} type="file" accept=".srt,.vtt,text/vtt,application/x-subrip" className="hidden" onChange={(event) => void importFile(event.target.files?.[0])} />
            </div>
            <p className="mt-2 text-xs text-slate-500 kurdish-text">فایلی SRT/VTT ڕابکێشە بۆ ئەم بەشە، یان لینک/IMDb ID دابنێ بۆ هەڵبژاردنی فیلم.</p>
          </section>

          <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            {[['original', 'سەرچاوە'], ['en', 'English'], ['ar', 'العربية'], ['ckb', 'سۆرانی']].map(([code, label]) => <span key={code} className={`rounded-full border px-3 py-1 text-xs font-black ${code === 'ckb' ? 'border-amber-400/50 bg-amber-400/10 text-amber-200' : 'border-white/10 text-slate-300'}`}>{label} {code === 'ckb' ? `(${cues.length} ڕستە)` : ''}</span>)}
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="گەڕان لە ڕستەکان…" className="mr-auto rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-white outline-none" />
          </section>

          <section className="grid gap-4 lg:grid-cols-[1fr_260px]">
            <div className="overflow-hidden rounded-2xl border border-white/10">
              <div className="grid grid-cols-[100px_1fr_auto] gap-2 border-b border-white/10 bg-black/25 px-3 py-2 text-[11px] font-black text-slate-400"><span>کات</span><span>دەقی ژێرنووس</span><span>کردار</span></div>
              <div className="max-h-[45vh] overflow-y-auto divide-y divide-white/5">
                {filteredCues.map((cue) => <div key={cue.id} className="grid grid-cols-[100px_1fr_auto] gap-2 p-3"><span className="pt-2 font-mono text-[10px] text-amber-200" dir="ltr">{cueTiming(cue)}</span><textarea value={cue.text} onChange={(event) => setCues((current) => current.map((item) => item.id === cue.id ? { ...item, text: event.target.value } : item))} rows={2} className="min-w-0 resize-y rounded-lg border border-white/10 bg-black/25 p-2 text-sm text-white outline-none focus:border-amber-400 kurdish-text" /><button type="button" onClick={() => void translateToSorani(cue)} disabled={busy} className="h-fit rounded-lg border border-amber-400/30 px-2 py-2 text-amber-200 hover:bg-amber-400/10" title="وەرگێڕانی دووبارە"><Wand2 className="h-4 w-4" /></button></div>)}
                {!filteredCues.length && <div className="p-10 text-center text-sm text-slate-500 kurdish-text">فایلی ژێرنووس باربکە یان لینکێک دابنێ.</div>}
              </div>
            </div>
            <aside className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <label className="block text-xs font-black text-slate-300 kurdish-text">جێگیرکردن لەسەر فیلم<select value={selectedMovieId} onChange={(event) => setSelectedMovieId(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-white"><option value="">فیلم هەڵبژێرە</option>{movies.map((movie) => <option key={movie.id} value={movie.id}>{movie.title}</option>)}</select></label>
              <button type="button" disabled={busy || !cues.length} onClick={() => void translateToSorani()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-3 py-3 text-sm font-black text-black disabled:opacity-50 kurdish-text">{paused ? <Play className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />} وەرگێڕانی سۆرانی</button>
              <button type="button" onClick={() => setPaused((value) => !value)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 px-3 py-3 text-sm font-black text-white kurdish-text"><Pause className="h-4 w-4" /> {paused ? "بەردەوامبوون" : "وەستان"}</button>
              <button type="button" disabled={busy || !selectedMovie || !cues.length} onClick={() => void applyToMovie()} className="w-full rounded-xl bg-red-600 px-3 py-3 text-sm font-black text-white disabled:opacity-50 kurdish-text">ئەم ژێرنووسە جێگیر بکە لەسەر فیلمەکە</button>
              <button type="button" disabled={!cues.length} onClick={() => downloadText(exportSubtitle(cues, false), `${selectedMovie?.title || 'kurdsub'}.vtt`, 'text/vtt;charset=utf-8')} className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-xs font-black text-white"><Download className="h-4 w-4" /> VTT</button>
              <button type="button" disabled={!cues.length} onClick={() => downloadText(exportSubtitle(cues, true), `${selectedMovie?.title || 'kurdsub'}.srt`, 'application/x-subrip;charset=utf-8')} className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-xs font-black text-white"><FileText className="h-4 w-4" /> SRT UTF-8 BOM</button>
            </aside>
          </section>
          {message && <p className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm font-bold text-amber-100 kurdish-text">{message}</p>}
        </div>
      </div>
    </div>
  );
}
