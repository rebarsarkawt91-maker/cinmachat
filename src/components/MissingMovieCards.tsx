import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { movieRequestLink, type ExternalTitleResponse } from '../utils/externalTitle';

/** Separate request cards, not playable catalog movies. No account or database writes. */
export function MissingMovieCards({ title, whatsappHref }: { title: string; whatsappHref: string }) {
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
  return (
    <section aria-label="پێشنیارەکانی IMDb بۆ داواکردنی فیلم" aria-busy={!data} className="mt-4 rounded-xl border border-amber-400/25 bg-black/20 p-4 text-right kurdish-text">
      <p className="text-sm font-black text-amber-200">گەڕان لە IMDb بۆ «{title}»</p>
      {!data ? <p role="status" className="mt-2 text-xs text-gray-400">لە IMDb دەگەڕێین…</p> : data.alreadyAvailable ? (
        <p className="mt-2 text-xs text-gray-300">ئەم ناوە لە سایتەکەمان هەیە؛ پۆلێنی هەموو فیلمەکان هەڵبژێرە.</p>
      ) : data.results.length ? <>
        <p className="mt-2 text-xs leading-6 text-gray-300">ئەمە تەنها کارتی زانیارییە، فیلمەکە لە سایتەکەمان بەردەست نییە. تکایە سکرینشۆتی کارتی فیلمەکە بکە و بۆ ئەم واتسئەپەی بنێرە، تا داوای بڵاوکردنەوەی بە ژێرنووسی زمانی کوردیی شیرین بکەیت.</p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {data.results.map(film => <article key={film.imdbId} data-imdb-id={film.imdbId} className="overflow-hidden rounded-xl border border-white/15 bg-[#15171c]">
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
              <p className="text-[10px] font-bold text-amber-300">لە سایتەکە بەردەست نییە · IMDb</p>
              {movieRequestLink(whatsappHref, film) && <a href={movieRequestLink(whatsappHref, film)} target="_blank" rel="noopener noreferrer" className="block rounded-lg bg-emerald-600 px-2 py-2 text-center text-[11px] font-bold text-white hover:bg-emerald-500">سکرینشۆتەکە بۆ واتسئەپ بنێرە</a>}
            </div>
          </article>)}
        </div>
      </> : <p role="status" className="mt-2 text-xs text-gray-400">{data.unavailable ? 'ئێستا ناتوانرێت زانیاریی IMDb بهێنرێت.' : 'لە IMDb ـیش کارتی گونجاو نەدۆزرایەوە.'}</p>}
      <a href={`https://www.imdb.com/find/?q=${encodeURIComponent(title)}&s=tt`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-xs font-bold text-amber-200 underline">گەڕانەکە لە IMDb بکەرەوە</a>
    </section>
  );
}
