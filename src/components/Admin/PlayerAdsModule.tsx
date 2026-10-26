import { useEffect, useState } from 'react';
import { defaultPlayerAds, parsePlayerAds, type PlayerAdsConfig } from '../../lib/playerAds';

export function PlayerAdsModule({ request }: { request: (method: 'GET' | 'PUT', value?: PlayerAdsConfig) => Promise<PlayerAdsConfig> }) {
  const [draft, setDraft] = useState(defaultPlayerAds);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { let alive = true;
    request('GET').then(value => { if (alive) { setDraft(parsePlayerAds(value)); setLoaded(true); } })
      .catch(error => { if (alive) setMessage(error.message); }).finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, []);
  return <form dir="rtl" className="space-y-5 rounded-2xl border border-white/10 bg-zinc-950 p-5 text-white" onSubmit={async event => {
    event.preventDefault(); setMessage('');
    try { const value = parsePlayerAds(draft); setBusy(true); setDraft(await request('PUT', value)); setMessage('پاشەکەوت کرا ✓'); }
    catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
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
        <input aria-label={`لینکی ڕیکلام ${index + 1}`} dir="ltr" placeholder="https://.../ad.mp4" className="min-w-40 flex-1 rounded bg-zinc-800 p-2" value={item.url} onChange={e => setDraft({ ...draft, items: draft.items.map((v, i) => i === index ? { ...v, url: e.target.value } : v) })} />
        <label className="flex gap-1"><input type="checkbox" checked={item.enabled} onChange={e => setDraft({ ...draft, items: draft.items.map((v, i) => i === index ? { ...v, enabled: e.target.checked } : v) })} />چالاک</label>
        <button type="button" className="rounded border border-red-500/40 p-2" onClick={() => setDraft({ ...draft, items: draft.items.filter((_, i) => i !== index) })}>سڕینەوە</button>
      </div>)}
      <p className="text-xs text-zinc-400">تەنها لینکی ڕاستەوخۆی HTTPS: MP4 / WebM / JPG / PNG / WebP. لینکی YouTube یان پەڕەی embed پشتگیری ناکرێت.</p>
      <button type="button" disabled={draft.items.length >= 6} className="rounded border border-white/20 px-4 py-2 disabled:opacity-40" onClick={() => setDraft({ ...draft, items: [...draft.items, { kind: 'image', url: '', enabled: true }] })}>+ زیادکردنی ڕیکلام</button>
      <button type="submit" className="mx-3 rounded bg-red-600 px-5 py-2 font-bold">پاشەکەوتکردن</button>
    </fieldset>
    <p role="status" className="text-sm text-yellow-300">{busy ? 'چاوەڕوان بە…' : message}</p>
  </form>;
}
