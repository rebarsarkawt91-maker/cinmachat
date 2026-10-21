import { Edit3, Film, Play } from 'lucide-react';
import type { Movie } from '../../types';

/** Edit is a sibling of Play, so touch/keyboard editing never starts playback. */
export function DramaEpisodeCard({ movie, order, onOpen, onEdit }: {
  movie: Movie & { posterUrl?: string }; order: number; onOpen: (movie: Movie) => void;
  onEdit?: (movie: Movie) => void;
}) {
  return <div className="relative min-w-0">
    <button type="button" onClick={() => onOpen(movie)}
      className="group w-full text-right focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500">
      <div className="aspect-[2/3] rounded-xl overflow-hidden bg-zinc-800 relative group-hover:ring-2 group-hover:ring-brand-primary/60 transition-all">
        {movie.posterUrl ? <img src={movie.posterUrl} alt={movie.title} loading="lazy" className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900"><Film className="w-8 h-8 text-white/20" /></div>}
        <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/70 border border-white/15 text-white text-[10px] font-black">Drama {order + 1}</span>
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-brand-primary text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"><Play className="w-4 h-4" /></div>
        </div>
      </div>
      <p className="mt-2 text-xs font-bold text-white kurdish-text line-clamp-1">{movie.title}</p>
    </button>
    {onEdit && <button type="button" onClick={() => onEdit(movie)} aria-label={`Edit ${movie.title}`}
      title="دەستکاریکردنی دراما و زیادکردنی VTT"
      className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-md border border-red-500/70 bg-black/80 px-2 py-1 text-[9px] font-black text-white shadow-lg hover:bg-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
      <Edit3 className="h-3 w-3" aria-hidden="true" /> EDIT
    </button>}
  </div>;
}
