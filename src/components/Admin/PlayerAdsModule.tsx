import { useEffect, useState } from 'react';
import { defaultPlayerAds, inferPlayerAdKind, parsePlayerAds, type PlayerAdsConfig } from '../../lib/playerAds';

export function PlayerAdsModule({ request }: { request: (method: 'GET' | 'PUT', value?: PlayerAdsConfig) => Promise<PlayerAdsConfig> }) {
  const [draft, setDraft] = useState(defaultPlayerAds);
  const [saved, setSaved] = useState(defaultPlayerAds);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { let alive = true;
    request('GET').then(value => { if (alive) { const config = parsePlayerAds(value); setDraft(config); setSaved(config); setLoaded(true); } })
      .catch(error => { if (alive) setMessage(error.message); }).finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, []);
  const save = async (next: PlayerAdsConfig, textOnly = false) => {
    setMessage('');
    try { const value = parsePlayerAds(next); setBusy(true); const persisted = parsePlayerAds(await request('PUT', value)); setDraft(current => textOnly ? { ...current, textAd: persisted.textAd } : persisted); setSaved(persisted); setMessage('پاشەکەوت کرا ✓ — ڕیکلامەکان لە لیستی خوارەوە هەڵگیراون.'); }
    catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  };
  return <section dir="rtl" className="space-y-5 text-white"><form className="space-y-5 rounded-2xl border border-white/10 bg-zinc-950 p-5" onSubmit={async event => {
    event.preventDefault(); await save(draft);
  }}>
    <h2 className="text-xl font-black">٢٢. ڕیکلامەکانی ناو پلەیەر</h2>
    <p className="text-sm text-zinc-400">تا ٦ وێنە یان ڤیدیۆ، بە نۆرە. فیلمەکە ناوەستێت؛ ڤیدیۆی ڕیکلام بێدەنگە و بینەر دەتوانێت دایبخات.</p>
    <fieldset disabled={busy || !loaded} className="space-y-4 disabled:opacity-50">
      <label className="flex gap-2"><input type="checkbox" checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })} /> چالاککردنی ڕیکلام</label>
      <div className="flex flex-wrap gap-4">
        <label>هەر چەند خولەک جارێک؟ <input aria-label="ماوە بە خولەک" className="w-20 rounded bg-zinc-800 p-2" type="number" min="1" max="60" value={draft.intervalSeconds / 60} onChange={e => setDraft({ ...draft, intervalSeconds: Number(e.target.value) * 60 })} /></label>
        <label>چەند چرکە دیار بێت؟ <input aria-label="ماوەی پیشاندان" className="w-20 rounded bg-zinc-800 p-2" type="number" min="3" max="30" value={draft.durationSeconds} onChange={e => setDraft({ ...draft, durationSeconds: Number(e.target.value) })} /></label>
      </div>
      {draft.items.map((item, index) => <div key={index} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 p-3">
        <span>{index + 1}</span>
        <select aria-label={`جۆری ڕیکلام ${index + 1}`} value={item.kind} className="rounded bg-zinc-800 p-2" onChange={e => setDraft({ ...draft, items: draft.items.map((v, i) => i === index ? { ...v, kind: e.target.value as 'image' | 'video' } : v) })}><option value="image">وێنە</option><option value="video">ڤیدیۆ</option></select>
        <input aria-label={`لینکی ڕیکلام ${index + 1}`} dir="ltr" placeholder="https://.../ad.mp4" className="min-w-40 flex-1 rounded bg-zinc-800 p-2" value={item.url} onChange={e => setDraft({ ...draft, items: draft.items.map((v, i) => i === index ? { ...v, url: e.target.value, kind: inferPlayerAdKind(e.target.value, v.kind) } : v) })} />
        <label className="flex gap-1"><input type="checkbox" checked={item.enabled} onChange={e => setDraft({ ...draft, items: draft.items.map((v, i) => i === index ? { ...v, enabled: e.target.checked } : v) })} />چالاک</label>
        <button type="button" className="rounded border border-red-500/40 p-2" onClick={() => setDraft({ ...draft, items: draft.items.filter((_, i) => i !== index) })}>سڕینەوە</button>
      </div>)}
      <p className="text-xs text-zinc-400">لینکی YouTube یان لینکی ڕاستەوخۆی HTTPS: MP4 / WebM / JPG / PNG / WebP. پەڕەی embedی سایتی تر پشتگیری ناکرێت.</p>
      <button type="button" disabled={draft.items.length >= 6} className="rounded border border-white/20 px-4 py-2 disabled:opacity-40" onClick={() => setDraft({ ...draft, items: [...draft.items, { kind: 'image', url: '', enabled: true }] })}>+ زیادکردنی ڕیکلام</button>
      <button type="submit" className="mx-3 rounded bg-red-600 px-5 py-2 font-bold">پاشەکەوتکردن</button>
      <button type="button" className="rounded bg-emerald-700 px-5 py-2 font-bold" onClick={() => void save({ ...draft, enabled: true })}>پاشەکەوتکردن و چالاککردن</button>
      <div className="space-y-3 rounded-xl border border-yellow-500/30 p-4" data-testid="player-text-ad-editor">
        <h3 className="font-black text-yellow-300">ڕیکلامی تێکست</h3>
        <p className="text-xs text-zinc-400">نووسینەکە بە تۆخ لە لای ڕاستی پلەیەر پیشان دەدرێت. کات‌بەندییەکەی جیاوازە و لەسەر ڕیکلامی ڤیدیۆ ناکەوێت.</p>
        <label className="flex gap-2"><input type="checkbox" checked={draft.textAd.enabled} onChange={e => setDraft({ ...draft, textAd: { ...draft.textAd, enabled: e.target.checked } })} />چالاککردنی ڕیکلامی تێکست</label>
        <label className="block text-sm font-bold">تێکستی ڕیکلام
          <textarea aria-label="تێکستی ڕیکلام" dir="auto" maxLength={300} rows={3} value={draft.textAd.text} className="mt-2 w-full rounded-lg bg-zinc-800 p-3 font-extrabold" style={{ color: draft.textAd.color }}
            onChange={e => setDraft({ ...draft, textAd: { ...draft.textAd, text: e.target.value } })} />
        </label>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">ڕەنگی نووسین <input type="color" aria-label="ڕەنگی تێکستی ڕیکلام" value={/^#[0-9a-f]{6}$/i.test(draft.textAd.color) ? draft.textAd.color : '#FFD400'} onChange={e => setDraft({ ...draft, textAd: { ...draft.textAd, color: e.target.value } })} /></label>
          <input aria-label="کۆدی ڕەنگی تێکست" dir="ltr" type="text" maxLength={7} placeholder="#FFD400" className="w-24 rounded bg-zinc-800 p-2 font-mono" value={draft.textAd.color} onChange={e => setDraft({ ...draft, textAd: { ...draft.textAd, color: e.target.value } })} />
          <label>هەر چەند خولەک؟ <input aria-label="ماوەی تێکست بە خولەک" type="number" min={1} max={60} className="w-20 rounded bg-zinc-800 p-2" value={draft.textAd.intervalSeconds / 60} onChange={e => setDraft({ ...draft, textAd: { ...draft.textAd, intervalSeconds: Number(e.target.value) * 60 } })} /></label>
          <label>چەند چرکە؟ <input aria-label="ماوەی پیشاندانی تێکست" type="number" min={3} max={30} className="w-20 rounded bg-zinc-800 p-2" value={draft.textAd.durationSeconds} onChange={e => setDraft({ ...draft, textAd: { ...draft.textAd, durationSeconds: Number(e.target.value) } })} /></label>
        </div>
        <button type="button" className="rounded bg-red-600 px-4 py-2 font-bold" onClick={() => void save({ ...saved, textAd: draft.textAd }, true)}>پاشەکەوتکردنی تێکست</button>
        <button type="button" className="mx-2 rounded bg-emerald-700 px-4 py-2 font-bold" onClick={() => void save({ ...saved, textAd: { ...draft.textAd, enabled: true } }, true)}>پاشەکەوتکردن و چالاککردنی تێکست</button>
      </div>
    </fieldset>
    <p role="status" className="text-sm font-bold text-yellow-300">{busy ? 'چاوەڕوان بە…' : message}</p>
  </form>
    {loaded && <div data-testid="saved-player-ads" className="space-y-3 rounded-2xl border border-white/10 bg-zinc-950 p-4">
      <h3 className="font-black">ڕیکلامە پاشەکەوتکراوەکان ({saved.items.length}/6)</h3>
      <p className="text-sm text-zinc-400">لینکە تۆمارکراوەکان دەمێننەوە تا خۆتان بیانسڕنەوە. گۆڕانکارییەکان تەنها دوای پاشەکەوتکردن جێگیر دەبن.</p>
      <p className={saved.enabled ? 'text-sm text-emerald-300' : 'text-sm text-yellow-300'}>ڕیکلامی وێنە/ڤیدیۆ: {saved.enabled ? `چالاکە — هەر ${saved.intervalSeconds / 60} خولەک، بۆ ${saved.durationSeconds} چرکە.` : 'ناچالاکە — بۆ پیشاندان «پاشەکەوتکردن و چالاککردن» دابگرە.'}</p>
      {!saved.items.length && !saved.textAd.text && <p className="text-sm text-zinc-400">هێشتا هیچ ڕیکلامێک تۆمار نەکراوە.</p>}
      {saved.items.map((item, index) => <article key={`${index}:${item.url}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-red-500/30 p-3" data-testid="saved-player-ad">
        <span className="font-bold">{index + 1}. {item.kind === 'video' ? 'ڤیدیۆ' : 'وێنە'}</span>
        <span className="text-xs text-zinc-400">{item.enabled ? 'چالاک' : 'ناچالاک'}</span>
        <p dir="ltr" className="min-w-0 flex-1 break-all text-sm">{item.url}</p>
        <button type="button" disabled={busy} className="rounded border border-red-500/50 px-3 py-2 text-sm disabled:opacity-40" aria-label={`سڕینەوەی ڕیکلامی پاشەکەوتکراوی ${index + 1}`}
          onClick={() => { const items = saved.items.filter((_, i) => i !== index); void save({ ...saved, items, enabled: saved.enabled && items.some(item => item.enabled) }); }}>سڕینەوەی هەمیشەیی</button>
      </article>)}
      {saved.textAd.text && <article data-testid="saved-player-text-ad" className="space-y-3 rounded-xl border border-yellow-500/30 p-3">
        <h4 className="text-sm font-bold">تێکستی پاشەکەوتکراو — {saved.textAd.enabled ? 'چالاک' : 'ناچالاک'} — هەر {saved.textAd.intervalSeconds / 60} خولەک، {saved.textAd.durationSeconds} چرکە</h4>
        <p dir="auto" className="whitespace-pre-wrap break-words font-extrabold" style={{ color: saved.textAd.color }}>{saved.textAd.text}</p>
        <button type="button" disabled={busy} className="rounded border border-red-500/50 px-3 py-2 text-sm disabled:opacity-40" onClick={() => void save({ ...saved, textAd: { ...saved.textAd, enabled: false, text: '' } }, true)}>سڕینەوەی تێکستی پاشەکەوتکراو</button>
      </article>}
    </div>}
  </section>;
}
