import type { StudioCue } from './types';

export type ExportFormat = 'vtt' | 'srt';
export type ExportMode = 'kurdish' | 'bilingual';

function pad(value: number, width = 2): string { return String(value).padStart(width, '0'); }

export function formatTimestamp(totalSeconds: number, format: ExportFormat): string {
  const milliseconds = Math.max(0, Math.round(totalSeconds * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  const millis = milliseconds % 1000;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}${format === 'srt' ? ',' : '.'}${pad(millis, 3)}`;
}

export function exportSubtitles(cues: StudioCue[], format: ExportFormat, mode: ExportMode): string {
  const blocks = cues.map((cue, index) => {
    const kurdish = String(cue.translation || cue.text).trim();
    const text = mode === 'bilingual' && kurdish !== cue.text.trim() ? `${cue.text.trim()}\n${kurdish}` : kurdish;
    const timing = `${formatTimestamp(cue.start, format)} --> ${formatTimestamp(cue.end, format)}`;
    return format === 'srt' ? `${index + 1}\n${timing}\n${text}` : `${cue.id || index + 1}\n${timing}\n${text}`;
  });
  return `${format === 'vtt' ? 'WEBVTT\n\n' : ''}${blocks.join('\n\n')}\n`;
}
