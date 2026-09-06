import { Loader2, RefreshCw } from 'lucide-react';
import type { SubtitleJobStatusProps } from './SubtitleJobStatus';
import { ROOM_FAILED, ROOM_PREPARING } from '../../lib/roomSubtitleCore';

// No job polling, invented ETA, technical errors, or pause instruction in rooms.
export default function RoomSubtitleStatus({ status, enabled = true, onRetry }: SubtitleJobStatusProps) {
  if (!enabled || (status !== 'loading' && status !== 'error')) return null;
  return <div className="flex justify-center px-3" role="status" aria-live="polite">
    <div className="flex items-center gap-2 rounded-xl bg-black/80 border border-white/10 px-3 py-2 text-xs text-white kurdish-text" dir="rtl">
      {status === 'loading' && <Loader2 className="w-3 h-3 animate-spin" />}
      <span>{status === 'error' ? ROOM_FAILED : ROOM_PREPARING}</span>
      {status === 'error' && onRetry && <button type="button" onClick={onRetry} className="rounded px-2 py-1 bg-white/10 hover:bg-white/20" aria-label="Retry subtitle translation"><RefreshCw className="w-3 h-3 inline" /> دووبارە</button>}
    </div>
  </div>;
}
