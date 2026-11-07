import React, { useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, Languages, Loader2, Paperclip, RefreshCw, Upload, X } from 'lucide-react';
import { api } from '../../services/api';
import type { Movie } from '../../types';

type Cue = { id: string; start: number; end: number; text: string; translation?: string; failed?: boolean };

type Props = {
  movies: Movie[];
  adminName: string;
  onClose: () => void;
  onAttached?: (movie: Movie) => void;
};

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const timeLabel = (seconds: number) => {
  const millis = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(millis / 3_600_000);
  const minutes = Math.floor((millis % 3_600_000) / 60_000);
  const secs = Math.floor((millis % 60_000) / 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

export default function SubtitleTranslatorStudio({ movies, adminName, onClose, onAttached }: Props) {
  const [source, setSource] = useState('');
  const [filename, setFilename] = useState('');
  const [cues, setCues] = useState<Cue[]>([]);
  const [glossary, setGlossary] = useState('Jack = جاک');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [movieQuery, setMovieQuery] = useState('');
  const [movieId, setMovieId] = useState('');
  const [attachedId, setAttachedId] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const filteredMovies = useMemo(() => {
    const needle = movieQuery.trim().toLocaleLowerCase();
    return movies.filter((movie) => !needle || `${movie.title} ${movie.id}`.toLocaleLowerCase().includes(needle)).slice(0, 30);
  }, [movieQuery, movies]);

  async function request(path: string, body: unknown, method = 'POST', signal?: AbortSignal) {
    const response = await fetch(api.resolveApiUrl(path), {
      method,
      credentials: 'include',
      signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Admin-Username': adminName },
      body: method === 'GET' ? undefined : JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.success === false) throw new Error(payload?.error || 'داواکارییەکە سەرکەوتوو نەبوو');
    return payload;
  }

  async function parseSource() {
    if (!source.trim()) return setMessage('فایلێک هەڵبژێرە یان دەقەکە بلکێنە.');
    setBusy(true); setMessage(''); setAttachedId('');
    try {
      const payload = await request('/api/admin/subtitles/parse', { content: source, filename });
      setCues(payload.cues || []);
      setProgress(0);
      setMessage(`${payload.cues?.length || 0} ڕستە ئامادە کرا.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'هەڵەی خوێندنەوە'); }
    finally { setBusy(false); }
  }

  async function translate(targetIds?: Set<string>) {
    if (!cues.length || busy) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true); setMessage(''); setAttachedId(''); setProgress(0);
    const targets = targetIds ? cues.filter((cue) => targetIds.has(cue.id)) : cues;
    let completed = 0;
    try {
      for (let offset = 0; offset < targets.length; offset += 30) {
        if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        const batch = targets.slice(offset, offset + 30);
        const firstIndex = cues.findIndex((cue) => cue.id === batch[0]?.id);
        const context = cues.slice(Math.max(0, firstIndex - 3), firstIndex);
        const payload = await request('/api/admin/subtitles/translate-batch', { cues: batch, context, glossary }, 'POST', controller.signal);
        const translated = new Map<string, { text: string; failed?: boolean }>(
          (payload.translations || []).map((item: any) => [String(item.cueId), { text: String(item.text || ''), failed: Boolean(item.failed) }]),
        );
        setCues((previous) => previous.map((cue) => {
          const result = translated.get(cue.id);
          return result ? { ...cue, translation: result.text, failed: result.failed } : cue;
        }));
        completed += batch.length;
        setProgress(Math.round((completed / targets.length) * 100));
        if (offset + 30 < targets.length) await sleep(400);
      }
      setMessage('وەرگێڕان تەواو بوو؛ دەتوانیت دەقەکان دەستکاری بکەیت.');
    } catch (error) {
      setMessage(error instanceof DOMException && error.name === 'AbortError' ? 'وەرگێڕان وەستێنرا.' : error instanceof Error ? error.message : 'وەرگێڕان شکستی هێنا');
    } finally { setBusy(false); abortRef.current = null; }
  }

  async function exportFile(format: 'vtt' | 'srt', mode: 'kurdish' | 'bilingual', download = true) {
    const payload = await request('/api/admin/subtitles/export', { cues, format, mode });
    if (download) {
      const blob = new Blob([payload.content], { type: format === 'vtt' ? 'text/vtt;charset=utf-8' : 'application/x-subrip;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = payload.filename || `cinamachat-ckb.${format}`; anchor.click();
      URL.revokeObjectURL(url);
    }
    return String(payload.content || '');
  }

  async function attach() {
    if (!movieId) return setMessage('فیلمێک هەڵبژێرە.');
    setBusy(true); setMessage('');
    try {
      const vtt = await exportFile('vtt', 'kurdish', false);
      const payload = await request('/api/admin/subtitles/attach', { movieId, vtt, adminName });
      setAttachedId(movieId); setMessage('ژێرنووسی کوردی بە فیلمەکەوە بەسترا و پاشەکەوت کرا.');
      onAttached?.(payload.movie);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'بەستنەوە شکستی هێنا'); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/85 p-2 sm:p-5" dir="rtl" role="dialog" aria-modal="true" aria-label="Kurdish Subtitle Translator">
      <section className="max-h-[96vh] w-full max-w-7xl overflow-y-auto rounded-2xl border border-red-500/35 bg-[#0d0d12] text-white shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#0d0d12]/95 px-4 py-3 backdrop-blur">
          <div><h2 className="flex items-center gap-2 text-lg font-black"><Languages className="text-red-500" /> وەرگێڕی ژێرنووسی کوردی</h2><p className="text-xs text-gray-400">تەنها بۆ بەڕێوەبەر — SRT / VTT / YouTube transcript</p></div>
          <button onClick={onClose} className="rounded-full border border-white/15 p-2 hover:bg-white/10" aria-label="داخستن"><X /></button>
        </header>

        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-white/10 bg-white/[.03] p-4">
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-red-500/50 bg-red-500/10 px-4 py-4 font-bold hover:bg-red-500/15">
              <Upload className="h-5 w-5" /> هەڵبژاردنی SRT / VTT / TXT
              <input type="file" accept=".srt,.vtt,.txt,text/plain,text/vtt" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; setFilename(file.name); setSource(await file.text()); }} />
            </label>
            <textarea value={source} onChange={(event) => setSource(event.target.value)} rows={8} className="w-full rounded-xl border border-white/10 bg-black/50 p-3 text-left text-sm outline-none focus:border-red-500" dir="auto" placeholder="ژێرنووس یان transcript ـی YouTube لێرە بلکێنە..." />
            <textarea value={glossary} onChange={(event) => setGlossary(event.target.value)} rows={3} className="w-full rounded-xl border border-white/10 bg-black/50 p-3 text-sm outline-none focus:border-amber-400" placeholder="Glossary: Jack = جاک" />
            <div className="flex flex-wrap gap-2">
              <button onClick={parseSource} disabled={busy || !source.trim()} className="rounded-xl bg-white/10 px-4 py-2 font-bold hover:bg-white/15 disabled:opacity-40">خوێندنەوە</button>
              <button onClick={() => void translate()} disabled={busy || !cues.length} className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 font-black hover:bg-red-500 disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Languages className="h-4 w-4" />} وەرگێڕان</button>
              {busy && <button onClick={() => abortRef.current?.abort()} className="rounded-xl border border-red-500 px-4 py-2">وەستاندن</button>}
              {!busy && cues.some((cue) => cue.failed) && <button onClick={() => void translate(new Set(cues.filter((cue) => cue.failed).map((cue) => cue.id)))} className="flex items-center gap-2 rounded-xl border border-amber-400/60 px-4 py-2"><RefreshCw className="h-4 w-4" /> دووبارەی هەڵەکان</button>}
            </div>
            {(busy || progress > 0) && <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-red-500 transition-all" style={{ width: `${progress}%` }} /></div>}
            {message && <p className="rounded-lg border border-white/10 bg-black/40 p-3 text-sm text-amber-100">{message}</p>}
          </div>

          <div className="space-y-3 rounded-xl border border-white/10 bg-white/[.03] p-4">
            <h3 className="font-black">بەستنەوە بە فیلم</h3>
            <input value={movieQuery} onChange={(event) => setMovieQuery(event.target.value)} className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 outline-none focus:border-red-500" placeholder="گەڕان بە ناوی فیلم یان ID..." />
            <select value={movieId} onChange={(event) => setMovieId(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#15151c] px-4 py-3 outline-none">
              <option value="">فیلمێک هەڵبژێرە</option>
              {filteredMovies.map((movie) => <option key={movie.id} value={movie.id}>{movie.title} — {movie.id}</option>)}
            </select>
            <button onClick={attach} disabled={busy || !movieId || !cues.length} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-black hover:bg-emerald-500 disabled:opacity-40"><Paperclip className="h-5 w-5" /> بەستنەوە و پاشەکەوتکردن</button>
            {attachedId && <a href={`/?movieId=${encodeURIComponent(attachedId)}`} className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-emerald-300"><CheckCircle2 className="h-5 w-5" /> بینینی فیلمەکە</a>}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button onClick={() => void exportFile('vtt', 'kurdish')} disabled={!cues.length} className="flex items-center justify-center gap-2 rounded-xl border border-white/15 p-2 disabled:opacity-40"><Download className="h-4 w-4" /> Kurdish VTT</button>
              <button onClick={() => void exportFile('srt', 'kurdish')} disabled={!cues.length} className="flex items-center justify-center gap-2 rounded-xl border border-white/15 p-2 disabled:opacity-40"><Download className="h-4 w-4" /> Kurdish SRT</button>
              <button onClick={() => void exportFile('vtt', 'bilingual')} disabled={!cues.length} className="rounded-xl border border-white/15 p-2 disabled:opacity-40">Bilingual VTT</button>
              <button onClick={() => void exportFile('srt', 'bilingual')} disabled={!cues.length} className="rounded-xl border border-white/15 p-2 disabled:opacity-40">Bilingual SRT</button>
            </div>
          </div>
        </div>

        {cues.length > 0 && <div className="mx-4 mb-4 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[850px] text-sm"><thead className="bg-white/[.06] text-gray-300"><tr><th className="p-3">کات</th><th className="p-3">دەقی سەرچاوە</th><th className="p-3">کوردی (دەستکاری دەکرێت)</th><th className="p-3">پشکنین</th></tr></thead>
            <tbody>{cues.map((cue) => {
              const translation = cue.translation || '';
              const lines = translation.split('\n');
              const cps = translation.replace(/\s/g, '').length / Math.max(0.1, cue.end - cue.start);
              const warning = lines.length > 2 || lines.some((line) => line.length > 42) || cps > 20;
              return <tr key={cue.id} className="border-t border-white/5 align-top"><td className="whitespace-nowrap p-3 text-xs text-gray-400">{timeLabel(cue.start)} → {timeLabel(cue.end)}</td><td className="max-w-sm p-3 text-left" dir="auto">{cue.text}</td><td className="p-2"><textarea value={translation} onChange={(event) => setCues((previous) => previous.map((entry) => entry.id === cue.id ? { ...entry, translation: event.target.value, failed: false } : entry))} rows={2} className={`w-full rounded-lg border bg-black/50 p-2 outline-none ${warning ? 'border-amber-400' : cue.failed ? 'border-red-500' : 'border-white/10'}`} /></td><td className="p-2"><button disabled={busy} onClick={() => void translate(new Set([cue.id]))} className="rounded-lg border border-white/15 px-2 py-1 text-xs hover:bg-white/10">دووبارە</button>{warning && <div className="mt-2 text-xs text-amber-300">درێژی/خێرایی: {cps.toFixed(1)} ن/چ</div>}</td></tr>;
            })}</tbody></table>
        </div>}
      </section>
    </div>
  );
}
