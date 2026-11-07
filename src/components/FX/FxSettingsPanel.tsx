import React, { useEffect, useRef } from 'react';
import { RotateCcw, Sparkles, Volume2, Vibrate, X } from 'lucide-react';
import { FX_BRAND_NAME, FX_BRAND_SUBTITLE } from '../../config/fxBrand';
import { applyFxPreset, resetFxSettings, updateFxSettings, useFxSettings, type FxPreset, type FxType } from '../../fx/fxSettings';
import { triggerHaptic, triggerPlayerShake } from '../../fx/hapticEffects';
import { fxSound } from '../../fx/fxSound';

const SWATCHES = ['#e50914', '#f59e0b', '#7f0000', '#7c3aed', '#06b6d4', '#10b981'];
const PRESETS: Array<{ id: Exclude<FxPreset, 'custom'>; label: string }> = [{ id: 'cinema', label: 'سینەما' }, { id: 'horror', label: 'ترسناک' }, { id: 'light', label: 'سووک' }];
const FX_TYPES: Array<{ id: FxType; label: string }> = [{ id: 'fight', label: 'شەڕ' }, { id: 'horror', label: 'ترس' }, { id: 'explosion', label: 'تەقینەوە' }];

export default function FxSettingsPanel({ onClose, iframePlayer = false, playerContainer = null }: { onClose: () => void; iframePlayer?: boolean; playerContainer?: HTMLElement | null }) {
  const settings = useFxSettings();
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); previous?.focus(); };
  }, [onClose]);

  const custom = (mutate: (current: typeof settings) => typeof settings) => updateFxSettings((current) => ({ ...mutate(current), preset: 'custom' }));
  const toggleMaster = async () => {
    const enabled = !settings.enabled;
    if (enabled) {
      try { sessionStorage.setItem('cinemafx_gesture_unlocked', '1'); } catch { /* unavailable storage */ }
      try {
        if (localStorage.getItem('cinemafx_notice_seen') !== '1') {
          window.alert('ئەم تایبەتمەندییە ڕووناکی و لەرزین و دەنگ بەکاردەهێنێت. ئەگەر ناڕەحەتی هەست دەکەیت بیکوژێنەوە');
          localStorage.setItem('cinemafx_notice_seen', '1');
        }
      } catch { /* private mode */ }
      if (settings.sound.enabled) await fxSound.unlock(settings.sound.volume);
    } else fxSound.stopAll();
    updateFxSettings((current) => ({ ...current, enabled }));
  };
  const testHaptic = (type: FxType) => {
    if (!settings.enabled || !settings.haptics.enabled) return;
    try { sessionStorage.setItem('cinemafx_gesture_unlocked', '1'); } catch { /* unavailable storage */ }
    const supported = triggerHaptic(type, settings.haptics.strength);
    triggerPlayerShake(playerContainer, matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (!supported) window.alert('ئەم ئامێرە پشتگیری لەرزین ناکات، جووڵەی پلەیەر بەکاردێت');
  };
  const testSound = async (name: keyof typeof settings.sound.types) => { if (!settings.enabled || !settings.sound.enabled) return; try { sessionStorage.setItem('cinemafx_gesture_unlocked', '1'); } catch { /* unavailable storage */ } await fxSound.unlock(settings.sound.volume); await fxSound.play(name, settings.sound.volume); };

  return <div className="fixed inset-0 z-[100300] flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={FX_BRAND_SUBTITLE} dir="rtl" className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl border border-red-500/30 bg-[#101014] p-4 text-white shadow-2xl outline-none sm:w-[440px] sm:rounded-3xl">
      <header className="mb-4 flex items-center justify-between"><div><h2 className="flex items-center gap-2 font-black"><Sparkles className="h-5 w-5 text-red-500" />{FX_BRAND_NAME}</h2><p className="text-xs text-zinc-400">{FX_BRAND_SUBTITLE}</p></div><button aria-label="داخستن" onClick={onClose} className="rounded-full p-2 hover:bg-white/10"><X /></button></header>
      <button onClick={() => void toggleMaster()} aria-pressed={settings.enabled} className={`mb-3 flex w-full items-center justify-between rounded-2xl border p-3 font-black ${settings.enabled ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200' : 'border-white/10 bg-white/5 text-zinc-300'}`}><span>{settings.enabled ? 'کوژاندنەوە' : 'داگیرساندن'}</span><span className={`h-6 w-11 rounded-full p-1 ${settings.enabled ? 'bg-emerald-500' : 'bg-zinc-600'}`}><span className={`block h-4 w-4 rounded-full bg-white transition-transform ${settings.enabled ? '-translate-x-5' : ''}`} /></span></button>
      <div className="mb-4 flex gap-2">{PRESETS.map((preset) => <button key={preset.id} onClick={() => applyFxPreset(preset.id)} className={`flex-1 rounded-full border px-2 py-2 text-xs font-bold ${settings.preset === preset.id ? 'border-red-400 bg-red-600' : 'border-white/10 bg-white/5'}`}>{preset.label}</button>)}</div>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[.03] p-3"><div className="flex items-center justify-between"><h3 className="font-black">ڕووناکی</h3><input type="checkbox" checked={settings.glow.enabled} onChange={(e) => custom((s) => ({ ...s, glow: { ...s.glow, enabled: e.target.checked } }))} /></div>
        <label className="block text-xs">تۆخی: {settings.glow.intensity}<input className="mt-1 w-full accent-red-500" type="range" min="0" max="100" value={settings.glow.intensity} onChange={(e) => custom((s) => ({ ...s, glow: { ...s.glow, intensity: Number(e.target.value) } }))} /></label>
        <div className="grid grid-cols-3 gap-1">{([['follow','دوای ڤیدیۆ'],['poster','پۆستەر'],['custom','ڕەنگی خۆم']] as const).map(([id,label]) => <button key={id} onClick={() => custom((s) => ({ ...s, glow: { ...s.glow, mode: id } }))} className={`rounded-lg p-2 text-[11px] ${settings.glow.mode === id ? 'bg-red-600' : 'bg-white/5'}`}>{label}</button>)}</div>
        <div className="flex flex-wrap gap-2">{SWATCHES.map((color) => <button key={color} aria-label={`ڕەنگ ${color}`} onClick={() => custom((s) => ({ ...s, glow: { ...s.glow, colors: [color, ...s.glow.colors.filter((item) => item !== color)].slice(0,3) } }))} className="h-7 w-7 rounded-full border-2 border-white/30" style={{ backgroundColor: color }} />)}{settings.glow.colors.map((color,index) => <input key={`${index}-${color}`} type="color" value={color} onChange={(e) => custom((s) => ({ ...s, glow: { ...s.glow, colors: s.glow.colors.map((item,i) => i === index ? e.target.value : item).slice(0,3) } }))} className="h-7 w-8 bg-transparent" />)}</div>
        <label className="block text-xs">تێری ڕەنگ: {settings.glow.saturation}%<input className="mt-1 w-full accent-red-500" type="range" min="50" max="150" value={settings.glow.saturation} onChange={(e) => custom((s) => ({ ...s, glow: { ...s.glow, saturation: Number(e.target.value) } }))} /></label>
        <div className="grid grid-cols-3 gap-1">{([['slow','هێواش'],['normal','ئاسایی'],['fast','خێرا']] as const).map(([id,label]) => <button key={id} onClick={() => custom((s) => ({ ...s, glow: { ...s.glow, speed: id } }))} className={`rounded-lg p-2 text-[11px] ${settings.glow.speed === id ? 'bg-amber-600' : 'bg-white/5'}`}>{label}</button>)}</div>
        <div className="h-5 rounded-full cinemafx-preview" style={{ background: `linear-gradient(90deg, ${settings.glow.colors.join(',')})`, opacity: settings.glow.intensity / 100 }} />
      </section>

      <section className="mt-3 space-y-3 rounded-2xl border border-white/10 bg-white/[.03] p-3"><div className="flex items-center justify-between"><h3 className="flex gap-2 font-black"><Vibrate className="h-4 w-4" /> لەرزین</h3><input type="checkbox" checked={settings.haptics.enabled} onChange={(e) => custom((s) => ({ ...s, haptics: { ...s.haptics, enabled: e.target.checked } }))} /></div>
        <div className="grid grid-cols-3 gap-1">{(['light','medium','strong'] as const).map((id) => <button key={id} onClick={() => custom((s) => ({ ...s, haptics: { ...s.haptics, strength: id } }))} className={`rounded-lg p-2 text-xs ${settings.haptics.strength === id ? 'bg-red-600' : 'bg-white/5'}`}>{id === 'light' ? 'سووک' : id === 'medium' ? 'مامناوەند' : 'بەهێز'}</button>)}</div>
        {FX_TYPES.map((type) => <div key={type.id} className="flex items-center gap-2"><input type="checkbox" checked={settings.haptics.types[type.id]} onChange={(e) => custom((s) => ({ ...s, haptics: { ...s.haptics, types: { ...s.haptics.types, [type.id]: e.target.checked } } }))} /><span className="flex-1 text-sm">{type.label}</span><button onClick={() => testHaptic(type.id)} className="rounded-lg border border-white/10 px-2 py-1 text-xs">تاقیکردنەوە</button></div>)}
        <label className="flex items-center justify-between text-sm"><span>جووڵەی پلەیەر</span><input type="checkbox" checked={settings.haptics.shake} onChange={(e) => custom((s) => ({ ...s, haptics: { ...s.haptics, shake: e.target.checked } }))} /></label>
      </section>

      <section className="mt-3 space-y-3 rounded-2xl border border-white/10 bg-white/[.03] p-3"><div className="flex items-center justify-between"><h3 className="flex gap-2 font-black"><Volume2 className="h-4 w-4" /> دەنگی ترسناک</h3><input type="checkbox" checked={settings.sound.enabled} onChange={(e) => { custom((s) => ({ ...s, sound: { ...s.sound, enabled: e.target.checked } })); if (e.target.checked && settings.enabled) void fxSound.unlock(settings.sound.volume); else fxSound.stopAll(); }} /></div>
        <label className="block text-xs">ئاستی دەنگ: {settings.sound.volume}<input className="mt-1 w-full accent-red-500" type="range" min="0" max="100" value={settings.sound.volume} onChange={(e) => custom((s) => ({ ...s, sound: { ...s.sound, volume: Number(e.target.value) } }))} /></label><p className="text-[11px] text-amber-300">دەنگ بە ئاستی نزم دەست پێدەکات</p>
        {(['heartbeat','drone','whoosh','impact'] as const).map((name) => <div key={name} className="flex items-center gap-2"><input type="checkbox" checked={settings.sound.types[name]} onChange={(e) => custom((s) => ({ ...s, sound: { ...s.sound, types: { ...s.sound.types, [name]: e.target.checked } } }))} /><span className="flex-1 text-sm">{name}</span><button onClick={() => void testSound(name)} className="rounded-lg border border-white/10 px-2 py-1 text-xs">تاقیکردنەوە</button></div>)}
      </section>
      <label className="mt-3 flex items-center justify-between rounded-xl bg-white/5 p-3 text-sm"><span>کاریگەرییە ئۆتۆماتیکییەکان</span><input type="checkbox" checked={settings.autoEffects} onChange={(e) => custom((s) => ({ ...s, autoEffects: e.target.checked }))} /></label>
      {iframePlayer && <p className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-100">لەم پلەیەرەدا ڕووناکی بە ڕەنگی پۆستەر کار دەکات و کاریگەریەکان بە دەستی دەست پێدەکەن</p>}
      <button onClick={() => { if (confirm('ڕێکخستنەکان بگەڕێندرێنەوە بۆ بنەڕەت؟')) resetFxSettings(); }} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 p-3 text-sm text-zinc-300"><RotateCcw className="h-4 w-4" /> گەڕاندنەوە بۆ بنەڕەت</button>
    </div>
  </div>;
}
