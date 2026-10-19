import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { movieRequestLink, type ExternalTitleResponse } from '../utils/externalTitle';

/** Separate request cards, not playable catalog movies. No account or database writes. */
export function MissingMovieCards({ title, whatsappHref, onOpenLocal }: { title: string; whatsappHref: string; onOpenLocal?: (id: string) => void }) {
  const [state, setState] = useState<{ title: string; data: ExternalTitleResponse } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    // Do not query the provider for every keystroke in title mode.
    const timer = setTimeout(() => {
      void api.lookupMissingTitle(title, controller.signal).then(data => {
        if (!controller.signal.aborted) setState({ title, data });
      });
    }, 700);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [title]);
  const data = state?.title === title ? state.data : null;
  const local = data?.local || [];
  const latestLocalYear = Math.max(0, ...local.map(film => Number(film.year) || 0));
  return (
    <section aria-label="پێشنیارەکانی IMDb بۆ داواکردنی فیلم" aria-busy={!data} className="mt-4 rounded-xl border border-amber-400/25 bg-black/20 p-4 text-right kurdish-text">
      <p className="text-sm font-black text-amber-200">پشکنینی ناو، بەش و ساڵ لە IMDb — «{title}»</p>
      {!data ? <p role="status" className="mt-2 text-xs text-gray-400">لە IMDb دەگەڕێین…</p> : <>
        <p className={`mt-2 text-xs font-bold ${data.alreadyAvailable ? 'text-emerald-300' : 'text-amber-200'}`}>
          {data.alreadyAvailable ? 'ئەنجامی داواکراو لە سایتەکەمان هەیە؛ لە خوارەوە ناو و بەش و ساڵەکانی تریش ببینە.' : 'هەمان ناو، بەش و ساڵی داواکراو لە سایتەکەمان نەدۆزرایەوە.'}
        </p>
        {local.length > 0 && <div className="mt-3 space-y-2 rounded-lg border border-emerald-400/25 bg-emerald-950/20 p-3">
          <p className="text-xs font-black text-emerald-300">ئەمانە لە سایتەکەمان بەردەستن:</p>
          {local.map(film => <button key={film.id} type="button" data-local-title-id={film.id} data-relation={film.relation}
            onClick={() => onOpenLocal?.(film.id)} disabled={!onOpenLocal}
            className="block w-full rounded-lg border border-white/10 bg-white/5 p-2 text-right text-xs text-white hover:bg-white/10 disabled:cursor-default">
            <span dir="auto" className="font-bold">{film.title}</span>
            <span className="mt-1 block text-[11px] text-emerald-200">{film.part ? `ژمارەی بەش: ${film.part}` : 'ناوی بێ ژمارەی بەش'} · ساڵی سایت: {film.year || 'نەزانراو'}</span>
            {film.relation === 'numbered' && <span className="mt-1 block text-[11px] text-yellow-200">ژمارەی بەش لەگەڵ داواکارییەکەت جیاوازە</span>}
            {film.relation === 'partial' && <span className="mt-1 block text-[11px] text-sky-200">پێشنیار بەپێی بەشێک لە ناوەکە</span>}
            {!!data.requestedYear && Number(film.year) > data.requestedYear && <span className="mt-1 block text-[11px] text-yellow-200">ساڵی ئەمە نوێترە لە ساڵی داواکارییەکەت</span>}
          </button>)}
        </div>}
        {data.results.length > 0 && <>
        <p className="mt-2 text-xs leading-6 text-gray-300">کارتەکانی IMDb تەنها زانیارین. بۆ ئەوەی لە سایتەکەمان نییە، تکایە سکرینشۆتی کارتەکە بکە و بۆ ئەم واتسئەپەی بنێرە، تا داوای بڵاوکردنەوەی بە ژێرنووسی زمانی کوردیی شیرین بکەیت.</p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {data.results.map(film => <article key={film.imdbId} data-imdb-id={film.imdbId} data-relation={film.relation} className="overflow-hidden rounded-xl border border-white/15 bg-[#15171c]">
            <a href={film.imdbUrl} target="_blank" rel="noopener noreferrer" className="block" aria-label={`IMDb: ${film.title}`}>
              <div className="relative flex aspect-[2/3] items-center justify-center bg-white/5 text-gray-500">
                <span aria-hidden="true">IMDb</span>
                {film.poster && <img src={film.poster} alt={film.title} width={240} height={360} loading="lazy" referrerPolicy="no-referrer"
                  onError={event => { event.currentTarget.style.opacity = '0'; }}
                  className="absolute inset-0 h-full w-full object-cover" />}
              </div>
            </a>
            <div className="space-y-2 p-3">
              <h4 dir="auto" className="text-sm font-black text-white">{film.title}</h4>
              <p className="text-[11px] text-gray-400">{film.year || '—'} · {film.kind === 'series' ? 'زنجیرە' : 'فیلم'} · {film.imdbId}</p>
              <p className="text-[10px] font-bold text-sky-200">{film.relation === 'partial' ? 'پێشنیار بەپێی بەشێک لە ناوەکە' : film.relation === 'numbered' ? (film.part ? `ناوی بە ژمارەی ${film.part} لە IMDb` : 'ناوی بنەڕەتی / بێ ژمارەی بەش') : film.relation === 'different-year' ? 'هاوناو بە ساڵێکی جیاواز' : 'گونجاو لەگەڵ ناو و بەش و ساڵی داواکراو'}</p>
              {!!film.year && latestLocalYear > 0 && film.year > latestLocalYear && <p className="text-[10px] font-bold text-yellow-200">ساڵی IMDb نوێترە لە ئەوەی لە سایتەکەمانە</p>}
              <p className={`text-[10px] font-bold ${film.availableId ? 'text-emerald-300' : 'text-amber-300'}`}>{film.availableId ? 'لە سایتەکە بەردەستە' : 'لە سایتەکە بەردەست نییە'} · IMDb</p>
              {film.availableId ? <button type="button" onClick={() => onOpenLocal?.(film.availableId!)} disabled={!onOpenLocal} className="w-full rounded-lg bg-emerald-600 px-2 py-2 text-[11px] font-bold text-white">لە سایتەکەمان بیکەرەوە</button> : movieRequestLink(whatsappHref, film) && <a href={movieRequestLink(whatsappHref, film)} target="_blank" rel="noopener noreferrer" className="block rounded-lg bg-emerald-600 px-2 py-2 text-center text-[11px] font-bold text-white hover:bg-emerald-500">سکرینشۆتەکە بۆ واتسئەپ بنێرە</a>}
            </div>
          </article>)}
        </div>
        <p className="mt-3 text-[10px] leading-5 text-gray-500">پێشنیارەکان بە ناو، ژمارە و ساڵ بەراورد کراون؛ هاوناوی بەڵگەی پەیوەندیی فەرمی بەشەکان نییە، و ساڵی IMDb بە تەنها دەرچوونی فیلم پشتڕاست ناکاتەوە.</p>
        </>}
        {(!data.results.length || data.unavailable) && <p role="status" className="mt-2 text-xs text-gray-400">{data.unavailable ? 'ئێستا ناتوانرێت زانیاریی IMDb بهێنرێت؛ ئەنجامە ناوخۆییەکان هەر بەردەستن.' : 'لە پێشنیارەکانی IMDb کارتی تری گونجاو نەدۆزرایەوە.'}</p>}
      </>}
      <a href={`https://www.imdb.com/find/?q=${encodeURIComponent(title)}&s=tt`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-xs font-bold text-amber-200 underline">گەڕانەکە لە IMDb بکەرەوە</a>
    </section>
  );
}
