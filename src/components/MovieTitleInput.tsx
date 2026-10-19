import { useId, useMemo, useState } from 'react';
import { Search, Sparkles } from 'lucide-react';
import type { Movie } from '../types';
import { rankNamedMovies } from '../utils/externalTitle';

/** Local autocomplete only: typing never requests AI/IMDb or writes to storage. */
export function MovieTitleInput({ value, onChange, onSubmit, onSelect, movies, smart = false, placeholder }: {
  value: string; onChange: (value: string) => void; onSubmit: () => void;
  onSelect: (movie: Movie) => void; movies: Movie[]; smart?: boolean; placeholder: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const suggestions = useMemo(() => rankNamedMovies(movies, value, 6), [movies, value]);
  const visible = open && suggestions.length > 0;
  const Icon = smart ? Sparkles : Search;
  const choose = (movie: Movie) => { setOpen(false); setActive(-1); onSelect(movie); };
  return <div className="relative flex-1 min-w-[220px] max-w-md text-right"
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setActive(-1); } }}>
    <Icon className={`pointer-events-none absolute right-5 top-1/2 h-5 w-5 -translate-y-1/2 ${smart ? 'text-brand-primary' : 'text-gray-500'}`} />
    <input type="text" role="combobox" aria-label={smart ? 'گەڕانی زیرەک بۆ فیلم' : 'گەڕان بە ناوی فیلم'}
      aria-autocomplete="list" aria-expanded={visible} aria-controls={visible ? id : undefined}
      aria-activedescendant={visible && suggestions[active] ? `${id}-${active}` : undefined}
      autoComplete="off" value={value} placeholder={placeholder}
      onChange={event => { onChange(event.target.value); setOpen(true); setActive(-1); }}
      onFocus={() => setOpen(true)}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Escape') { event.preventDefault(); setOpen(false); setActive(-1); }
        else if (visible && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
          event.preventDefault();
          setActive(index => event.key === 'ArrowDown' ? (index + 1) % suggestions.length : (index <= 0 ? suggestions.length : index) - 1);
        } else if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          if (visible && suggestions[active]) choose(suggestions[active]);
          else { setOpen(false); onSubmit(); }
        }
      }}
      className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pr-11 pl-5 kurdish-text transition-all focus:border-brand-primary focus:bg-white/10 focus:outline-none" />
    {visible && <ul id={id} role="listbox" aria-label="پێشنیاری ناوی فیلم" className="absolute top-full left-0 right-0 z-50 mt-2 max-h-80 overflow-y-auto rounded-xl border border-white/20 bg-[#15171c] p-1 text-right shadow-2xl">
      {suggestions.map((movie, index) => <li key={movie.id} id={`${id}-${index}`} role="option" aria-selected={index === active}>
        <button type="button" tabIndex={-1} onMouseDown={event => event.preventDefault()} onClick={() => choose(movie)}
          className={`flex w-full items-center gap-3 rounded-lg p-2 text-right focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500 ${index === active ? 'bg-white/15' : 'hover:bg-white/10'}`}>
          <div className="h-16 w-11 shrink-0 overflow-hidden rounded bg-white/5">
            {movie.image && <img src={movie.image} alt="" className="h-full w-full object-cover" loading="lazy" />}
          </div>
          <span className="min-w-0 flex-1"><span dir="auto" className="block text-sm font-bold text-white kurdish-text">{movie.title}</span>
            <span className="mt-1 block text-xs text-gray-400">{movie.year || '—'} · لە سایتەکەمان بەردەستە</span></span>
        </button>
      </li>)}
    </ul>}
  </div>;
}
