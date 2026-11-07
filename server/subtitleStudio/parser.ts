import { cleanSubtitleNoise } from './noiseCleaner';
import type { StudioCue, SubtitleFormat } from './types';

const TIME_RANGE = /((?:\d{1,2}:)?\d{1,2}:\d{2}[,.]\d{3})\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[,.]\d{3})/;
const TRANSCRIPT_LINE = /^\s*((?:\d{1,2}:)?\d{1,2}:\d{2})(?:[,.](\d{1,3}))?\s+(.+)$/;

export function timestampToSeconds(value: string): number {
  const normalized = value.replace(',', '.');
  const parts = normalized.split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return parts[0] * 60 + parts[1];
}

function parseTimedBlocks(content: string): StudioCue[] {
  const blocks = content.replace(/^\uFEFF/, '').replace(/\r/g, '').split(/\n{2,}/);
  const cues: StudioCue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    const timeIndex = lines.findIndex((line) => TIME_RANGE.test(line));
    if (timeIndex < 0) continue;
    const match = lines[timeIndex].match(TIME_RANGE);
    if (!match) continue;
    const text = cleanSubtitleNoise(lines.slice(timeIndex + 1).join('\n'));
    if (!text) continue;
    cues.push({ id: String(cues.length + 1), start: timestampToSeconds(match[1]), end: timestampToSeconds(match[2]), text });
  }
  return cues;
}

function parseTranscript(content: string): StudioCue[] {
  const raw: Array<{ start: number; text: string }> = [];
  let pendingTime: number | null = null;
  for (const sourceLine of content.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n')) {
    const line = sourceLine.trim();
    if (!line) continue;
    const inline = line.match(TRANSCRIPT_LINE);
    if (inline) {
      const fraction = inline[2] ? Number(`0.${inline[2].padEnd(3, '0')}`) : 0;
      const text = cleanSubtitleNoise(inline[3]);
      if (text) raw.push({ start: timestampToSeconds(inline[1]) + fraction, text });
      pendingTime = null;
      continue;
    }
    if (/^(?:\d{1,2}:)?\d{1,2}:\d{2}(?:[,.]\d{1,3})?$/.test(line)) {
      pendingTime = timestampToSeconds(line);
      continue;
    }
    if (pendingTime !== null) {
      const text = cleanSubtitleNoise(line);
      if (text) raw.push({ start: pendingTime, text });
      pendingTime = null;
    }
  }
  return raw.map((cue, index) => ({
    id: String(index + 1),
    start: cue.start,
    end: Math.max(cue.start + 1, raw[index + 1]?.start ?? cue.start + 4),
    text: cue.text,
  }));
}

export function detectSubtitleFormat(content: string, hint?: string): SubtitleFormat {
  const normalizedHint = String(hint || '').toLowerCase();
  if (normalizedHint.includes('vtt')) return 'vtt';
  if (normalizedHint.includes('srt')) return 'srt';
  if (/^\s*WEBVTT/i.test(content)) return 'vtt';
  if (TIME_RANGE.test(content)) return 'srt';
  return 'transcript';
}

export function parseSubtitleContent(content: string, hint?: string): StudioCue[] {
  const format = detectSubtitleFormat(content, hint);
  const cues = format === 'transcript' ? parseTranscript(content) : parseTimedBlocks(content);
  if (cues.length > 5000) throw new Error('زۆرترین ژمارەی ڕستە ٥٠٠٠ دانەیە');
  return cues;
}
