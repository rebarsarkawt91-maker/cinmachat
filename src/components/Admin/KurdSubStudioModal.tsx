import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, FileText, Loader2, Pause, RotateCcw, Sparkles, Subtitles, Upload, Wand2, X } from "lucide-react";
import type { Movie } from "../../types";

type StudioCue = {
  id: string;
  index: number;
  start: number;
  end: number;
  originalText: string;
  translatedText: string;
};

type RemoteTrack = {
  id: string;
  language: string;
  languageCode: string;
  fileName: string;
  downloads: number;
  hearingImpaired: boolean;
};

type TrackCategory = "all" | "english" | "kurdish" | "sorani" | "other";
type TranslationStatus = "idle" | "running" | "paused" | "failed" | "complete";

interface KurdSubStudioModalProps {
  movies: Movie[];
  adminName: string;
  onClose: () => void;
  onApply: (movieId: string, subtitleText: string) => Promise<void>;
}

const STUDIO_DB = "kurdish_sub_studio_db";
const STUDIO_STORE = "projects";
const BATCH_SIZE = 20;

function timestamp(seconds: number, separator: "." | ",") {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const wholeSeconds = Math.floor((ms % 60_000) / 1000);
  return String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0") + ":" +
    String(wholeSeconds).padStart(2, "0") + separator + String(ms % 1000).padStart(3, "0");
}

function parseTime(value: string) {
  const match = value.match(/^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!match) return NaN;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
}

function parseStudioText(raw: string, alreadyTranslated = false) {
  const blocks = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split(/\n\s*\n/);
  const cues: StudioCue[] = [];
  const usedIndices = new Set<number>();
  let corrupt = 0;
  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (!lines[0] || /^(?:WEBVTT|NOTE|STYLE|REGION)(?:\s|$)/i.test(lines[0])) continue;
    const timingAt = lines.findIndex((line) => /\d{2}:\d{2}:\d{2}[,.]\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}[,.]\d{3}/.test(line));
    if (timingAt < 0) {
      corrupt += 1;
      continue;
    }
    const timing = lines[timingAt].match(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}[,.]\d{3})/);
    const start = parseTime(timing?.[1] || "");
    const end = parseTime(timing?.[2] || "");
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      corrupt += 1;
      continue;
    }
    const sourceIndex = Number(lines[0]);
    const index = Number.isSafeInteger(sourceIndex) && sourceIndex > 0 && !usedIndices.has(sourceIndex)
      ? sourceIndex : cues.length + 1;
    usedIndices.add(index);
    // Keep only supported inline subtitle formatting, without interpreting it as HTML.
    const text = lines.slice(timingAt + 1).join("\n").trim()
      .replace(/<(?!\/?(?:i|b)>)[^>]*>/gi, "");
    cues.push({
      id: String(index) + "-" + String(Math.round(start * 1000)) + "-" + String(cues.length),
      index, start, end,
      originalText: text,
      translatedText: alreadyTranslated ? text : "",
    });
  }
  return { cues, corrupt };
}

function outputText(cue: StudioCue) {
  return cue.translatedText.trim() || cue.originalText.trim();
}

function exportSubtitle(cues: StudioCue[], asSrt: boolean) {
  const separator = asSrt ? "," : ".";
  const body = cues.map((cue) => {
    const time = timestamp(cue.start, separator) + " --> " + timestamp(cue.end, separator);
    return (asSrt ? String(cue.index) + "\n" : "") + time + "\n" + outputText(cue);
  }).join("\n\n");
  return asSrt ? "\uFEFF" + body + "\n" : "WEBVTT\n\n" + body + "\n";
}

function downloadText(content: string, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function trackCategory(track: RemoteTrack): TrackCategory {
  const code = track.languageCode.toLowerCase();
  const name = track.language.toLowerCase();
  if (code === "ckb" || code === "sor" || /sorani|سۆرانی/.test(name)) return "sorani";
  if (/^(?:ku|kur|kmr|sdh)(?:[-_]|$)/.test(code) || /kurd|کورد/.test(name)) return "kurdish";
  if (/^(?:en|eng)(?:[-_]|$)/.test(code) || /english|ئینگلیزی/.test(name)) return "english";
  return "other";
}

function matchesCategory(track: RemoteTrack, category: TrackCategory) {
  const group = trackCategory(track);
  return category === "all" || group === category || (category === "kurdish" && group === "sorani");
}

function normalizeStoredCues(value: unknown): StudioCue[] {
  if (!Array.isArray(value)) return [];
  return value.filter((cue) => Number.isFinite(Number(cue?.start)) && Number.isFinite(Number(cue?.end)))
    .map((cue, position) => ({
      id: String(cue.id || position),
      index: Number(cue.index || position + 1),
      start: Number(cue.start),
      end: Number(cue.end),
      originalText: String(cue.originalText ?? cue.text ?? ""),
      translatedText: String(cue.translatedText ?? ""),
    }));
}

async function openStudioDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(STUDIO_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STUDIO_STORE)) {
        request.result.createObjectStore(STUDIO_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveProject(project: Record<string, unknown>) {
  const db = await openStudioDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STUDIO_STORE, "readwrite");
      transaction.objectStore(STUDIO_STORE).put(project);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

async function latestProject(): Promise<any | null> {
  const db = await openStudioDb();
  try {
    const projects = await new Promise<any[]>((resolve, reject) => {
      const request = db.transaction(STUDIO_STORE, "readonly").objectStore(STUDIO_STORE).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    return projects.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0] || null;
  } finally {
    db.close();
  }
}

export default function KurdSubStudioModal({ movies, adminName, onClose, onApply }: KurdSubStudioModalProps) {
  const [source, setSource] = useState("");
  const [loadedSource, setLoadedSource] = useState("");
  const [projectKey, setProjectKey] = useState("draft");
  const [cues, setCues] = useState<StudioCue[]>([]);
  const [remoteTracks, setRemoteTracks] = useState<RemoteTrack[]>([]);
  const [analyzedUrl, setAnalyzedUrl] = useState("");
  const [trackCounts, setTrackCounts] = useState<Record<string, number | null>>({});
  const [selectedTrackId, setSelectedTrackId] = useState("");
  const [category, setCategory] = useState<TrackCategory>("all");
  const [selectedMovieId, setSelectedMovieId] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [singleCueBusy, setSingleCueBusy] = useState("");
  const [translationStatus, setTranslationStatus] = useState<TranslationStatus>("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [message, setMessage] = useState("");
  const [corruptCount, setCorruptCount] = useState(0);
  const [restored, setRestored] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pauseRequested = useRef(false);
  const translationController = useRef<AbortController | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const trackCountCache = useRef<Record<string, number | null>>({});
  const trackCountSource = useRef("");

  useEffect(() => {
    let active = true;
    void latestProject().then((project) => {
      if (!active) return;
      if (project) {
        setSource(String(project.source || ""));
        setLoadedSource(String(project.source || ""));
        setProjectKey(String(project.id || "draft"));
        setCues(normalizeStoredCues(project.cues));
        setSelectedMovieId(String(project.selectedMovieId || ""));
        const restoredTracks: RemoteTrack[] = Array.isArray(project.remoteTracks) ? project.remoteTracks : [];
        setRemoteTracks(restoredTracks);
        setCategory(restoredTracks.some((track) => trackCategory(track) === "english") ? "english" : "all");
        setAnalyzedUrl(String(project.analyzedUrl || ""));
      }
    }).catch(() => {}).finally(() => { if (active) setRestored(true); });
    return () => {
      active = false;
      pauseRequested.current = true;
      translationController.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!restored) return;
    const project = {
      id: projectKey, source: loadedSource, cues, selectedMovieId, remoteTracks, analyzedUrl,
      updatedAt: new Date().toISOString(),
    };
    // Serialize writes so rapid inline edits cannot finish out of order.
    saveQueue.current = saveQueue.current.catch(() => {}).then(() => saveProject(project));
    void saveQueue.current.catch(() => setMessage("پاشەکەوتکردنی دەستکاریکردنەکان سەرکەوتوو نەبوو"));
  }, [restored, projectKey, loadedSource, cues, selectedMovieId, remoteTracks, analyzedUrl]);

  // Older saved projects kept only the first 28 discovered tracks. Refresh
  // that list without replacing the editor's unsaved/translated cue text.
  useEffect(() => {
    if (!restored || !analyzedUrl || remoteTracks.length > 28) return;
    const controller = new AbortController();
    void fetch("/api/kurdsub/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Username": adminName },
      body: JSON.stringify({ url: analyzedUrl, adminName }),
      signal: controller.signal,
    }).then((response) => response.json()).then((result) => {
      if (!controller.signal.aborted && Array.isArray(result?.tracks) && result.tracks.length > remoteTracks.length) {
        setRemoteTracks(result.tracks);
        setCategory(result.tracks.some((track: RemoteTrack) => trackCategory(track) === "english") ? "english" : "all");
      }
    }).catch(() => {});
    return () => controller.abort();
  }, [restored, analyzedUrl, remoteTracks.length, adminName]);

  useEffect(() => {
    if (!analyzedUrl || !remoteTracks.length) return;
    const controller = new AbortController();
    if (trackCountSource.current !== analyzedUrl) {
      trackCountSource.current = analyzedUrl;
      trackCountCache.current = {};
      setTrackCounts({});
    }
    const pendingIds = remoteTracks.filter((track) => matchesCategory(track, category))
      .map((track) => track.id).filter((id) => !(id in trackCountCache.current));
    const batches = Array.from({ length: Math.ceil(pendingIds.length / 8) }, (_, index) => pendingIds.slice(index * 8, index * 8 + 8));
    let cursor = 0;
    const countBatch = async () => {
      while (!controller.signal.aborted && cursor < batches.length) {
        const ids = batches[cursor++];
        try {
          const response = await fetch("/api/subtitles/tracks-counts", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Admin-Username": adminName },
            body: JSON.stringify({
              url: analyzedUrl,
              imdbId: analyzedUrl.match(/tt\d{7,10}/i)?.[0]?.toLowerCase(),
              trackIds: ids,
              adminName,
            }),
            signal: controller.signal,
          });
          const result = await response.json();
          if (controller.signal.aborted) return;
          for (const id of ids) trackCountCache.current[id] = response.ok && typeof result?.counts?.[id] === "number" ? result.counts[id] : null;
        } catch {
          if (controller.signal.aborted) return;
          for (const id of ids) trackCountCache.current[id] = null;
        }
        setTrackCounts({ ...trackCountCache.current });
      }
    };
    void Promise.all(Array.from({ length: Math.min(2, batches.length) }, () => countBatch()));
    return () => controller.abort();
  }, [adminName, analyzedUrl, remoteTracks, category]);

  const filteredCues = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? cues.filter((cue) =>
      cue.originalText.toLowerCase().includes(needle) || cue.translatedText.toLowerCase().includes(needle)) : cues;
  }, [cues, query]);
  const visibleTracks = useMemo(() => remoteTracks.filter((track) => matchesCategory(track, category)), [remoteTracks, category]);
  const selectedMovie = movies.find((movie) => movie.id === selectedMovieId);
  const completedCount = cues.filter((cue) => cue.translatedText.trim()).length;
  const missingCount = cues.filter((cue) => !cue.originalText.trim() || !cue.translatedText.trim()).length;

  const setSubtitleText = (text: string, key: string, alreadyTranslated = false, displaySource = source.trim()) => {
    const parsed = parseStudioText(text, alreadyTranslated);
    if (!parsed.cues.length) throw new Error("No valid subtitle cues found");
    setCues(parsed.cues);
    setLoadedSource(displaySource);
    setCorruptCount(parsed.corrupt);
    setProjectKey(key);
    setTranslationStatus("idle");
    setProgress({ done: alreadyTranslated ? parsed.cues.length : 0, total: parsed.cues.length });
    setMessage(String(parsed.cues.length) + " ڕستە دۆزرایەوە" +
      (parsed.corrupt ? " · " + String(parsed.corrupt) + " بەشی تێکچوو هەیە" : ""));
  };

  const loadRemoteTrack = async (track: RemoteTrack, embedUrl = analyzedUrl) => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/subtitles/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Username": adminName },
        body: JSON.stringify({
          url: embedUrl,
          imdbId: embedUrl.match(/tt\d{7,10}/i)?.[0]?.toLowerCase(),
          trackId: track.id,
          adminName,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.srt) throw new Error(result?.error || "Subtitle track could not be downloaded");
      const group = trackCategory(track);
      setSubtitleText(result.srt, embedUrl + "#" + track.id, group === "kurdish" || group === "sorani", embedUrl);
      setSelectedTrackId(track.id);
      setMessage(track.language + " — " + track.fileName);
    } catch (error: any) {
      setMessage(error?.message || "بارکردنی ژێرنووس سەرکەوتوو نەبوو");
    } finally {
      setBusy(false);
    }
  };

  const loadFromUrl = async () => {
    const entered = source.trim();
    const value = /^tt\d{7,10}$/i.test(entered)
      ? "https://proxy.garageband.rocks/embed/movie/" + entered.toLowerCase() : entered;
    const imdbId = value.match(/tt\d{7,10}/i)?.[0]?.toLowerCase();
    const matchedMovie = movies.find((movie: any) =>
      imdbId ? String(movie.imdbId || movie.imdbUrl || "").toLowerCase().includes(imdbId)
        : value && [movie.videoUrl, movie.streamingUrl, movie.embedUrl, movie.youtubeMovieUrl, movie.otherVideoUrl]
          .some((url) => String(url || "").trim() === value));
    if (matchedMovie) setSelectedMovieId(matchedMovie.id);
    if (!/^https?:\/\//i.test(value)) {
      setMessage("تکایە لینکی http(s)، IMDb ID، یان فایلی SRT/VTT دیاری بکە.");
      return;
    }
    setBusy(true);
    setSource(value);
    setLoadedSource(value);
    setMessage("");
    try {
      if (/^https?:\/\/(?:[^/]+\.)?garageband\.rocks\/embed\/(?:movie|tv)\/tt\d{7,10}/i.test(value)) {
        const response = await fetch("/api/kurdsub/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Admin-Username": adminName },
          body: JSON.stringify({ url: value, adminName }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(result?.tracks)) throw new Error(result?.error || "Subtitle track discovery failed");
        const tracks = result.tracks as RemoteTrack[];
        setRemoteTracks(tracks);
        setAnalyzedUrl(value);
        setCategory(tracks.some((track) => trackCategory(track) === "english") ? "english" : "all");
        setCues([]);
        setProjectKey(value);
        const firstEnglish = tracks.find((track) => trackCategory(track) === "english");
        if (firstEnglish) await loadRemoteTrack(firstEnglish, value);
        else setMessage(tracks.length
          ? String(tracks.length) + " ژێرنووس دۆزرایەوە. یەکێکیان هەڵبژێرە."
          : result.notice || "هیچ ژێرنووسێک نەدۆزرایەوە.");
        return;
      }
      setRemoteTracks([]);
      setAnalyzedUrl("");
      if (/(?:youtu\.be\/|(?:www\.)?youtube\.com\/)/i.test(value)) {
        const response = await fetch("/api/subtitle/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: value, lang: "original" }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result?.srt) throw new Error(result?.error || "YouTube subtitles could not be discovered");
        setSubtitleText(result.srt, value, false, value);
        return;
      }
      const response = await fetch("/api/subtitle/remote?url=" + encodeURIComponent(value));
      const text = await response.text();
      if (!response.ok) throw new Error("Subtitle source could not be loaded");
      setSubtitleText(text, value, false, value);
    } catch (error: any) {
      if (matchedMovie?.subtitleText) {
        try { setSubtitleText(matchedMovie.subtitleText, value, true, value); return; } catch { /* Show the source error. */ }
      }
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
    try {
      setSource(file.name);
      setLoadedSource(file.name);
      setRemoteTracks([]);
      setAnalyzedUrl("");
      setSubtitleText(await file.text(), file.name + ":" + String(file.lastModified), false, file.name);
    } catch (error: any) {
      setMessage(error?.message || "فایلی ژێرنووس نادروستە");
    }
  };

  const translateBatch = async (batch: StudioCue[], signal: AbortSignal) => {
    const response = await fetch("/api/kurdsub/translate-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Username": adminName },
      body: JSON.stringify({
        adminName,
        cues: batch.map((cue) => ({
          index: cue.index, start: cue.start, end: cue.end, text: cue.originalText,
        })),
      }),
      signal,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(result?.cues) || result.cues.length !== batch.length) {
      throw new Error(result?.error || "Gemini translation failed");
    }
    return result.cues as Array<{ index: number; text: string }>;
  };

  const translateToSorani = async (singleCue?: StudioCue) => {
    if (singleCue) {
      if (!singleCue.originalText.trim()) {
        setMessage("دەقی ئەم ڕستەیە بەتاڵە؛ سەرەتا دەقی سەرچاوە بنووسە.");
        return;
      }
      setSingleCueBusy(singleCue.id);
      try {
        const result = await translateBatch([singleCue], new AbortController().signal);
        setCues((current) => current.map((cue) =>
          cue.id === singleCue.id ? { ...cue, translatedText: result[0].text } : cue));
        setMessage("ئەم ڕستەیە دووبارە وەرگێڕدرا.");
      } catch (error: any) {
        setMessage(error?.message || "وەرگێڕانی ڕستە سەرکەوتوو نەبوو");
      } finally {
        setSingleCueBusy("");
      }
      return;
    }

    const pending = cues.filter((cue) => cue.originalText.trim() && !cue.translatedText.trim());
    if (!pending.length) {
      setMessage("هەموو ڕستەکان وەرگێڕدراون.");
      return;
    }
    pauseRequested.current = false;
    setTranslating(true);
    setTranslationStatus("running");
    setMessage("");
    let done = completedCount;
    setProgress({ done, total: cues.length });
    const controller = new AbortController();
    translationController.current = controller;
    try {
      for (let offset = 0; offset < pending.length; offset += BATCH_SIZE) {
        if (pauseRequested.current) break;
        const batch = pending.slice(offset, offset + BATCH_SIZE);
        const result = await translateBatch(batch, controller.signal);
        const translatedByIndex = new Map(result.map((item) => [item.index, item.text]));
        const submittedTextByIndex = new Map(batch.map((cue) => [cue.index, cue.originalText]));
        setCues((current) => current.map((cue) => {
          const translated = translatedByIndex.get(cue.index);
          return translated === undefined || cue.originalText !== submittedTextByIndex.get(cue.index) || cue.translatedText.trim()
            ? cue : { ...cue, translatedText: translated };
        }));
        done += result.length;
        setProgress({ done, total: cues.length });
      }
      setTranslationStatus(pauseRequested.current ? "paused" : "complete");
      setMessage(pauseRequested.current ? "وەرگێڕان وەستا؛ دەتوانیت بەردەوام بیت." : "وەرگێڕانی سۆرانی تەواو بوو.");
    } catch (error: any) {
      if (!controller.signal.aborted) {
        setTranslationStatus("failed");
        setMessage(error?.message || "وەرگێڕان سەرکەوتوو نەبوو؛ دووبارە هەوڵ بدە.");
      }
    } finally {
      setTranslating(false);
      translationController.current = null;
    }
  };

  const applyToMovie = async () => {
    if (!selectedMovieId || !cues.length || missingCount || corruptCount) {
      setMessage("تکایە فیلم هەڵبژێرە و ڕستە بەتاڵ و تێکچووەکان چاک بکە.");
      return;
    }
    setBusy(true);
    try {
      await onApply(selectedMovieId, exportSubtitle(cues, false));
      setMessage("ژێرنووسی کوردی بە سەرکەوتوویی جێگیرکرا لەسەر فیلمەکە.");
    } catch (error: any) {
      setMessage(error?.message || "جێگیرکردنی ژێرنووس سەرکەوتوو نەبوو");
    } finally {
      setBusy(false);
    }
  };

  const categories: Array<[TrackCategory, string]> = [
    ["english", "ئینگلیزی / English"],
    ["kurdish", "زمانی کوردی"],
    ["sorani", "سۆرانی"],
    ["other", "زمانەکانی تر"],
  ];

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

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); void importFile(event.dataTransfer.files?.[0]); }}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-black text-white kurdish-text">سەرچاوە و شیکردنەوەی لینک</h3><span className="text-xs text-slate-400">IMDb · Embed · YouTube · SRT/VTT</span></div>
            <div className="flex flex-col gap-2 md:flex-row">
              <input value={source} onChange={(event) => setSource(event.target.value)} placeholder="https://…  |  tt1234567  |  subtitle URL" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none focus:border-amber-400" dir="ltr" />
              <button type="button" onClick={() => void loadFromUrl()} disabled={busy || translating} className="rounded-xl bg-amber-400 px-4 py-3 text-sm font-black text-black disabled:opacity-50 kurdish-text">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "شیکردنەوە / هێنان"}</button>
              <button type="button" onClick={() => inputRef.current?.click()} disabled={translating} className="flex items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm font-black text-white kurdish-text"><Upload className="h-4 w-4" /> فایل</button>
              <input ref={inputRef} type="file" accept=".srt,.vtt,text/vtt,application/x-subrip" className="hidden" onChange={(event) => void importFile(event.target.files?.[0])} />
            </div>
          </section>

          {remoteTracks.length > 0 && (
            <section className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.04] p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-black text-white kurdish-text">تڕاکە دۆزراوەکان ({remoteTracks.length})</h3>
                <span className="text-xs text-amber-200">Subtitle tracks</span>
              </div>
              <div className="mb-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => setCategory("all")} className={"rounded-full border px-3 py-1 text-xs font-black " + (category === "all" ? "border-amber-300 bg-amber-400/15 text-amber-100" : "border-white/10 text-slate-300")}>هەموو ({remoteTracks.length})</button>
                {categories.map(([code, label]) => {
                  const count = remoteTracks.filter((track) => matchesCategory(track, code)).length;
                  return <button key={code} type="button" onClick={() => setCategory(code)} className={"rounded-full border px-3 py-1 text-xs font-black " + (category === code ? "border-amber-300 bg-amber-400/15 text-amber-100" : "border-white/10 text-slate-300")}>{label} ({count})</button>;
                })}
              </div>
              <div className="grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                {visibleTracks.map((track) => (
                  <button key={track.id} type="button" disabled={busy || translating} onClick={() => void loadRemoteTrack(track)}
                    className={"rounded-xl border bg-black/25 p-3 text-right transition-colors hover:border-amber-300/70 hover:bg-amber-400/10 disabled:opacity-50 " + (selectedTrackId === track.id ? "border-amber-400/80" : "border-white/10")}>
                    <span className="block truncate text-sm font-black text-white" dir="ltr">{track.fileName}</span>
                    <span className="mt-1 block text-[11px] text-slate-400">{track.languageCode.toUpperCase()} · {track.downloads.toLocaleString()} {track.hearingImpaired ? "· HI" : ""}</span>
                    <span className="mt-1 inline-flex rounded-full bg-amber-400/10 px-2 py-0.5 text-[11px] font-black text-amber-200">
                      {typeof trackCounts[track.id] === "number" ? String(trackCounts[track.id]) + " ڕستە" : (track.id in trackCounts ? "ژمارە نەدۆزرایەوە" : "ژماردنی دێڕەکان…")}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-black text-slate-300">سەرچاوە: {cues.length} دێڕ</span>
            <span className="rounded-full border border-amber-400/50 bg-amber-400/10 px-3 py-1 text-xs font-black text-amber-200">سۆرانی: {completedCount} دێڕ</span>
            {corruptCount > 0 && <span className="rounded-full border border-red-400/50 px-3 py-1 text-xs text-red-200">{corruptCount} بەشی تێکچوو</span>}
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="گەڕان لە ڕستەکان…" className="mr-auto rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-white outline-none" />
          </section>

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="overflow-hidden rounded-2xl border border-white/10">
              <div className="hidden grid-cols-[116px_minmax(0,1fr)_minmax(0,1fr)_42px] gap-2 border-b border-white/10 bg-black/25 px-3 py-2 text-[11px] font-black text-slate-400 md:grid">
                <span>کات / ژمارە</span><span>دەقی سەرچاوە</span><span>وەرگێڕانی سۆرانی</span><span>AI</span>
              </div>
              <div className="max-h-[48vh] divide-y divide-white/5 overflow-y-auto">
                {corruptCount > 0 && <div role="alert" className="flex items-center gap-2 bg-red-400/10 p-3 text-xs font-bold text-red-200 kurdish-text">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> {corruptCount} بەشی ژێرنووس نەخوێندرایەوە؛ تکایە فایلی سەرچاوە چاک بکە و دووبارە باربکە.
                </div>}
                {filteredCues.map((cue) => {
                  const warning = !cue.originalText.trim() || !cue.translatedText.trim() || cue.end <= cue.start;
                  return <div key={cue.id} className="grid grid-cols-1 gap-2 p-3 md:grid-cols-[116px_minmax(0,1fr)_minmax(0,1fr)_42px]">
                    <div className="pt-1 font-mono text-[10px] text-amber-200" dir="ltr"><span className="block">#{cue.index}</span>{timestamp(cue.start, ".")} → {timestamp(cue.end, ".")}</div>
                    <label className="min-w-0 text-[11px] font-bold text-slate-400 md:text-transparent">سەرچاوە
                      <textarea value={cue.originalText} disabled={translating || singleCueBusy === cue.id} onChange={(event) => setCues((current) => current.map((item) => item.id === cue.id ? { ...item, originalText: event.target.value, translatedText: "" } : item))}
                        rows={2} dir="auto" className="mt-1 w-full resize-y rounded-lg border border-white/10 bg-black/25 p-2 text-sm text-white outline-none focus:border-amber-400" />
                    </label>
                    <label className="min-w-0 text-[11px] font-bold text-slate-400 md:text-transparent">سۆرانی
                      <textarea value={cue.translatedText} disabled={translating || singleCueBusy === cue.id} onChange={(event) => setCues((current) => current.map((item) => item.id === cue.id ? { ...item, translatedText: event.target.value } : item))}
                        rows={2} dir="rtl" placeholder="وەرگێڕانی سۆرانی…" className="mt-1 w-full resize-y rounded-lg border border-white/10 bg-black/25 p-2 text-sm text-white outline-none focus:border-amber-400 kurdish-text" />
                      {warning && <span className="mt-1 inline-flex items-center gap-1 rounded bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-200"><AlertTriangle className="h-3 w-3" />{!cue.originalText.trim() ? "دەقی سەرچاوە بەتاڵە" : "وەرگێڕان نەکراوە"}</span>}
                    </label>
                    <button type="button" onClick={() => void translateToSorani(cue)} disabled={busy || translating || !!singleCueBusy || !cue.originalText.trim()}
                      className="h-fit rounded-lg border border-amber-400/30 px-2 py-2 text-amber-200 hover:bg-amber-400/10 disabled:opacity-50" title="وەرگێڕانی دووبارەی ئەم ڕستەیە" aria-label={"وەرگێڕانی دووبارەی ڕستە " + cue.index}>
                      {singleCueBusy === cue.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                    </button>
                  </div>;
                })}
                {!filteredCues.length && <div className="p-10 text-center text-sm text-slate-500 kurdish-text">فایلی ژێرنووس باربکە یان لینکێک دابنێ.</div>}
              </div>
            </div>

            <aside className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <label className="block text-xs font-black text-slate-300 kurdish-text">جێگیرکردن لەسەر فیلم
                <select value={selectedMovieId} onChange={(event) => setSelectedMovieId(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-white">
                  <option value="">فیلم هەڵبژێرە</option>{movies.map((movie) => <option key={movie.id} value={movie.id}>{movie.title}</option>)}
                </select>
              </label>
              <div role="status" aria-live="polite" className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs font-black text-amber-100 kurdish-text">
                وەرگێڕدراوە: {translating ? progress.done : completedCount} / {cues.length} دێڕ
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-amber-400 transition-all" style={{ width: String(cues.length ? Math.round(100 * (translating ? progress.done : completedCount) / cues.length) : 0) + "%" }} /></div>
              </div>
              <button type="button" disabled={busy || translating || !cues.length || !cues.some((cue) => cue.originalText.trim() && !cue.translatedText.trim())}
                onClick={() => void translateToSorani()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-3 py-3 text-sm font-black text-black disabled:opacity-50 kurdish-text">
                {translationStatus === "paused" || translationStatus === "failed" ? <RotateCcw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                {translationStatus === "paused" ? "بەردەوامبوون" : translationStatus === "failed" ? "دووبارە هەوڵدانەوە" : "وەرگێڕانی سۆرانی"}
              </button>
              {translating && <button type="button" onClick={() => { pauseRequested.current = true; setTranslationStatus("paused"); }}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 px-3 py-3 text-sm font-black text-white kurdish-text">
                <Pause className="h-4 w-4" /> وەستان
              </button>}
              <button type="button" disabled={busy || translating || !selectedMovie || !cues.length || missingCount > 0 || corruptCount > 0}
                onClick={() => void applyToMovie()} className="w-full rounded-xl bg-red-600 px-3 py-3 text-sm font-black text-white disabled:opacity-50 kurdish-text">ئەم ژێرنووسە جێگیر بکە لەسەر فیلمەکە</button>
              <button type="button" disabled={!cues.length} onClick={() => downloadText(exportSubtitle(cues, false), (selectedMovie?.title || "kurdsub") + ".vtt", "text/vtt;charset=utf-8")}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-xs font-black text-white"><Download className="h-4 w-4" /> VTT</button>
              <button type="button" disabled={!cues.length} onClick={() => downloadText(exportSubtitle(cues, true), (selectedMovie?.title || "kurdsub") + ".srt", "application/x-subrip;charset=utf-8")}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-xs font-black text-white"><FileText className="h-4 w-4" /> SRT UTF-8 BOM</button>
            </aside>
          </section>
          {message && <p role="alert" className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm font-bold text-amber-100 kurdish-text">{message}</p>}
        </div>
      </div>
    </div>
  );
}
