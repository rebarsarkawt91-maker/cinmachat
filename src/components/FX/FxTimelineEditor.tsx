import React, { useState } from 'react';
import { Plus, Save, Trash2, X } from 'lucide-react';
import type { FxType } from '../../fx/fxSettings';
import type { MovieEffect } from '../../fx/effectTimeline';

export default function FxTimelineEditor({ effects, currentTime, onClose, onSave }: {
  effects: MovieEffect[]; currentTime: number; onClose: () => void; onSave: (effects: MovieEffect[]) => Promise<void>;
}) {
  const [items, setItems] = useState<MovieEffect[]>(effects);
  const [type, setType] = useState<FxType>('fight');
  const [saving, setSaving] = useState(false);
  const add = () => setItems((current) => [...current, { t: Math.max(0, Number(currentTime.toFixed(2))), d: 2, type }].sort((a, b) => a.t - b.t));
  return <div dir="rtl" className="absolute bottom-full right-0 z-[100] mb-3 w-[min(92vw,340px)] rounded-2xl border border-red-500/30 bg-[#101014]/98 p-3 text-white shadow-2xl backdrop-blur-xl">
    <div className="mb-3 flex items-center justify-between"><strong className="text-sm">نیشانەکانی کاریگەری</strong><button onClick={onClose} aria-label="داخستن"><X className="h-4 w-4" /></button></div>
    <div className="mb-3 flex gap-2"><select value={type} onChange={(e) => setType(e.target.value as FxType)} className="flex-1 rounded-lg border border-white/10 bg-zinc-900 p-2 text-xs"><option value="fight">شەڕ</option><option value="horror">ترس</option><option value="explosion">تەقینەوە</option></select><button onClick={add} className="flex items-center gap-1 rounded-lg bg-red-600 px-3 text-xs font-bold"><Plus className="h-3 w-3" /> نیشانە</button></div>
    <div className="max-h-52 space-y-2 overflow-y-auto">{items.map((item, index) => <div key={`${item.t}-${index}`} className="grid grid-cols-[1fr_70px_34px] gap-2 rounded-lg bg-white/5 p-2"><div><div className="mb-1 text-[10px] text-zinc-400">{item.type}</div><input aria-label="کاتی کاریگەری" type="number" min="0" max="86400" step="0.1" value={item.t} onChange={(e) => setItems((current) => current.map((entry, i) => i === index ? { ...entry, t: Number(e.target.value) } : entry))} className="w-full rounded bg-black/40 px-2 py-1 text-xs" /></div><label className="text-[10px] text-zinc-400">ماوە<input aria-label="ماوەی کاریگەری" type="number" min="0.5" max="30" step="0.5" value={item.d} onChange={(e) => setItems((current) => current.map((entry, i) => i === index ? { ...entry, d: Number(e.target.value) } : entry))} className="mt-1 w-full rounded bg-black/40 px-2 py-1 text-xs text-white" /></label><button aria-label="سڕینەوە" onClick={() => setItems((current) => current.filter((_, i) => i !== index))} className="self-end rounded p-1 text-red-400 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button></div>)}</div>
    <button disabled={saving} onClick={async () => { setSaving(true); try { await onSave(items); onClose(); } finally { setSaving(false); } }} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 p-2 text-xs font-black disabled:opacity-50"><Save className="h-4 w-4" /> {saving ? 'پاشەکەوت دەکرێت...' : 'پاشەکەوتکردن'}</button>
  </div>;
}
