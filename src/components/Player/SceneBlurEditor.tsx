import { useEffect, useRef, useState } from "react";
import { Clock, Plus, Save, Trash2, X } from "lucide-react";
import { formatSceneTime, MAX_SCENE_BLUR_RANGES, parseSceneTime, validateSceneBlurConfig, type SceneBlurConfig } from "../../lib/sceneBlur";

type DraftRange = { id: number; start: string; end: string };

export function SceneBlurEditor({ movieId, config, currentTime, approximateClock, syncError, onSave, onClose }: {
  movieId: string;
  config: SceneBlurConfig;
  currentTime: number;
  approximateClock: boolean;
  syncError?: string | null;
  onSave: (config: SceneBlurConfig) => Promise<void>;
  onClose: () => void;
}) {
  const [enabled, setEnabled] = useState(config.enabled);
  const [ranges, setRanges] = useState<DraftRange[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const configKey = JSON.stringify(config);
  useEffect(() => {
    const value = JSON.parse(configKey) as SceneBlurConfig;
    setEnabled(value.enabled);
    setRanges(value.ranges.map(range => ({ id: ++sequence.current, start: formatSceneTime(range.start), end: formatSceneTime(range.end) })));
    setError("");
  }, [movieId, configKey]);

  const change = (id: number, field: "start" | "end", value: string) => {
    setRanges(previous => previous.map(range => range.id === id ? { ...range, [field]: value } : range));
    setError("");
  };
  const now = Number.isFinite(currentTime) ? Math.max(0, currentTime) : 0;
  const save = async () => {
    const parsed = ranges.map(range => ({ start: parseSceneTime(range.start), end: parseSceneTime(range.end) }));
    if (parsed.some(range => range.start === null || range.end === null || range.end <= range.start)) {
      setError("کاتەکان بە خولەک:چرکە بنووسە؛ کۆتایی دەبێت دوای دەستپێک بێت.");
      return;
    }
    setSaving(true); setError("");
    try {
      const value = validateSceneBlurConfig({ enabled, ranges: parsed });
      await onSave(value);
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "ڕێکخستنەکان پاشەکەوت نەکران.");
    } finally { setSaving(false); }
  };

  return <section id="scene-blur-editor" role="dialog" aria-label="ڕێکخستنی تەڵخکردنی دیمەن" dir="rtl" lang="ckb"
    className="absolute bottom-24 right-3 z-[95] max-h-[calc(100dvh-140px)] w-[min(380px,calc(100vw-24px))] overflow-y-auto rounded-2xl border border-white/15 bg-zinc-950/95 p-4 text-white shadow-2xl kurdish-text"
    onPointerDown={event => event.stopPropagation()} onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="text-sm font-bold">تەڵخکردنی دیمەن بۆ هەموو بینەران</h3>
      <button type="button" onClick={onClose} aria-label="داخستنی ڕێکخستنی تەڵخکردن" className="rounded-lg p-1 hover:bg-white/10"><X className="h-4 w-4" /></button>
    </div>
    <label className="mb-3 flex cursor-pointer items-center gap-2 text-xs">
      <input type="checkbox" autoFocus checked={enabled} onChange={event => setEnabled(event.target.checked)} disabled={saving} className="accent-amber-400" />
      چالاککردنی ماوە دیاریکراوەکان
    </label>
    <p className="mb-3 text-[11px] text-zinc-400">کاتی ئێستا: <span dir="ltr">{formatSceneTime(now)}</span> · کات بە شێوەی 12:30 یان 01:12:30</p>
    {approximateClock && <p role="note" className="mb-3 rounded-lg bg-amber-400/10 p-2 text-[11px] leading-6 text-amber-200">کاتی لینکی دەرەکی ڕەنگە چەند چرکە جیاوازی هەبێت. ماوەکان تاقی بکەرەوە؛ بۆ شاردنەوەی ورد لینکی ڕاستەوخۆی MP4/HLS بەکاربهێنە.</p>}
    <div className="space-y-3">
      {ranges.map((range, index) => <div key={range.id} className="rounded-xl border border-white/10 p-2">
        <div className="mb-2 flex items-center justify-between text-[11px] text-zinc-400"><span>ماوەی {index + 1}</span><button type="button" disabled={saving} onClick={() => setRanges(previous => previous.filter(item => item.id !== range.id))} aria-label={`سڕینەوەی ماوەی ${index + 1}`} className="rounded p-1 text-red-300 hover:bg-red-500/15"><Trash2 className="h-3.5 w-3.5" /></button></div>
        <div className="grid grid-cols-2 gap-2">
          {(["start", "end"] as const).map(field => <label key={field} className="text-[11px] text-zinc-300">
            {field === "start" ? "دەستپێک" : "کۆتایی"}
            <div className="mt-1 flex gap-1">
              <input value={range[field]} onChange={event => change(range.id, field, event.target.value)} disabled={saving} dir="ltr" aria-label={`${field === "start" ? "دەستپێک" : "کۆتایی"}ی ماوەی ${index + 1}`} className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black px-2 py-1.5 font-mono text-xs outline-none focus:border-amber-400" />
              <button type="button" disabled={saving} onClick={() => change(range.id, field, formatSceneTime(now))} title="دانانی کاتی ئێستا" aria-label={`${field === "start" ? "دەستپێک" : "کۆتایی"} لە کاتی ئێستا`} className="rounded-lg bg-white/5 px-2 hover:bg-white/10"><Clock className="h-3.5 w-3.5" /></button>
            </div>
          </label>)}
        </div>
      </div>)}
    </div>
    {!ranges.length && <p className="py-4 text-xs text-zinc-400">هێشتا هیچ ماوەیەک دیاری نەکراوە.</p>}
    <button type="button" disabled={saving || ranges.length >= MAX_SCENE_BLUR_RANGES} onClick={() => setRanges(previous => [...previous, { id: ++sequence.current, start: formatSceneTime(now), end: formatSceneTime(Math.min(86400, now + 10)) }])} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 py-2 text-xs hover:bg-white/5 disabled:opacity-40"><Plus className="h-4 w-4" /> زیادکردنی ماوە</button>
    {(error || syncError) && <p role="alert" className="mt-3 text-xs text-red-300">{error || syncError}</p>}
    <button type="button" disabled={saving} onClick={() => { void save(); }} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 py-2.5 text-xs font-bold text-black disabled:opacity-50"><Save className="h-4 w-4" />{saving ? "پاشەکەوت دەکرێت..." : "پاشەکەوتکردن بۆ هەموو بینەران"}</button>
  </section>;
}
