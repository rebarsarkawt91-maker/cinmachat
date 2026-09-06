import type { CSSProperties } from 'react';
import { ccSubtitleBottomPercent, SUBTITLE_SYNC_LEAD_S } from '../../hooks/useSubtitleManager';
import type { RoomCue, RoomSubtitleLanguage } from '../../lib/roomSubtitleCore';

/** Shared room renderer; all playback clocks and style controls remain owned
 * by their existing players. Rendering captions never controls playback. */
export default function RoomSubtitleOverlay({ cues, original, time, language, settings, font, style }: {
  cues: RoomCue[]; original: RoomCue[]; time: number; language: RoomSubtitleLanguage;
  settings?: { showSubtitle: boolean; showOriginal: boolean; subtitleOffsetY?: number };
  font?: { mobileCls: string; cls: string }; style?: CSSProperties;
}) {
  if (settings?.showSubtitle === false) return null;
  const at = time + SUBTITLE_SYNC_LEAD_S;
  const cue = cues.find((item) => at >= item.start && at <= item.end);
  if (!cue) return null;
  const source = settings?.showOriginal && language !== 'original' ? original.find((item) => at >= item.start && at <= item.end) : undefined;
  const fontClass = `${font?.mobileCls || 'text-base'} ${font?.cls.split(' ').filter((item) => item.startsWith('md:')).join(' ') || 'md:text-2xl'}`;
  return <div className="pointer-events-none absolute inset-x-3 z-10 flex flex-col items-center gap-1 transition-[bottom] duration-300"
    style={{bottom: ccSubtitleBottomPercent(settings?.subtitleOffsetY)}} data-room-subtitle={language} data-cue-index={cue.index}>
    {source && <div dir="auto" className={`max-w-[92%] whitespace-pre-line rounded-lg px-3 py-1.5 text-center font-bold leading-snug opacity-70 ${fontClass}`}
      style={{color:'#cccccc',backgroundColor:'rgba(0,0,0,0.5)',textShadow:'0 1px 4px rgba(0,0,0,0.8)'}}>{source.text}</div>}
    <div dir={language === 'original' ? 'auto' : 'rtl'} className={`max-w-[92%] whitespace-pre-line rounded-lg px-3 py-2 text-center font-bold leading-snug shadow-[0_2px_14px_rgba(0,0,0,0.75)] ${fontClass}`}
      style={{...(style || {color:'#ffffff',backgroundColor:'rgba(0,0,0,0.7)',textShadow:'0 1px 6px rgba(0,0,0,0.9)'}), textAlign:'center'}}>{cue.text}</div>
  </div>;
}
