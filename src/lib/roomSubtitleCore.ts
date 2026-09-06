// Room-only extraction of the existing App SRT/VTT parser. The regular movie
// player's parser and sanitization policy deliberately remain independent.
export type RoomSubtitleLanguage = 'original' | 'ckb' | 'ar-IQ' | 'ar';
export type RoomCue = {
  index: number;
  id: string;
  start: number;
  end: number;
  text: string;
  rawLines: string[];
  timing: string;
};

export const ROOM_SUBTITLE_LANGUAGES = [
  { code: 'original', label: 'زمانی ڕەسەن', shortLabel: 'ORIGINAL' },
  { code: 'ckb', label: 'کوردی ناوەڕاست، سۆرانی', shortLabel: 'CKB' },
  { code: 'ar-IQ', label: 'عەرەبی عێراقی', shortLabel: 'IQ' },
  { code: 'ar', label: 'عەرەبی ئاسایی', shortLabel: 'AR' },
] as const;
export const ROOM_PREPARING = 'وەرگێڕان ئامادە دەکرێت...';
export const ROOM_FAILED = 'وەرگێڕان سەرکەوتوو نەبوو — دووبارە هەوڵ بدەرەوە';

export function loadRoomSubtitleLanguage(): RoomSubtitleLanguage {
  try {
    const value = localStorage.getItem('cinemachat_room_subtitle_lang');
    if (ROOM_SUBTITLE_LANGUAGES.some((item) => item.code === value)) return value as RoomSubtitleLanguage;
  } catch { /* Storage is optional. */ }
  return 'original';
}

function seconds(value: string): number {
  return value.replace(',', '.').split(':').reduce((total, part) => total * 60 + Number(part), 0);
}

function decode(value: string): string {
  return value.replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#(?:39|x27);/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    });
}

export function parseRoomSubtitleCues(subtitleText: string): RoomCue[] {
  const lines = subtitleText.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const cues: RoomCue[] = [];
  const timePattern = /((?:\d{2,}:)?\d{2}:\d{2}[.,]\d{3})\s+-->\s+((?:\d{2,}:)?\d{2}:\d{2}[.,]\d{3})/;
  for (let i = 0; i < lines.length; i++) {
    if (/^(NOTE|STYLE|REGION)(?:\s|$)/.test(lines[i])) {
      while (i < lines.length && lines[i].trim()) i++;
      continue;
    }
    const match = lines[i].match(timePattern);
    if (!match) continue;
    const previous = (lines[i - 1] || '').trim();
    const id = previous && !/^WEBVTT/.test(previous) ? previous : `cue-${cues.length}`;
    const timing = lines[i];
    const rawLines: string[] = [];
    while (++i < lines.length && lines[i].trim()) rawLines.push(lines[i]);
    const text = rawLines.map(decode).join('\n').trim();
    const start = seconds(match[1]);
    const end = seconds(match[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error('Invalid subtitle timing');
    if (text) cues.push({ index: cues.length, id, start, end, text, rawLines, timing });
  }
  return cues;
}

// Normalize script, not vocabulary. URLs are opaque and must survive exactly.
export function normalizeSorani(text: string): string {
  return text.split(/(https?:\/\/[^\s]+|www\.[^\s]+)/g)
    .map((part) => /^(https?:\/\/|www\.)/.test(part) ? part : part.normalize('NFC').replace(/ي/g, 'ی').replace(/ك/g, 'ک'))
    .join('');
}

export function roomCacheIdentity(videoId: string, contentHash: string, sourceLanguage: string, targetLanguage: string, modelVersion: string): string {
  return JSON.stringify([videoId, contentHash, sourceLanguage, targetLanguage, modelVersion]);
}

export function priorityBatch(cues: RoomCue[], completed: ReadonlySet<number>, currentTime: number, size = 20): RoomCue[] {
  const time = Number.isFinite(currentTime) ? Math.max(0, currentTime) : 0;
  const rank = (cue: RoomCue) => cue.end >= time - 2 && cue.start <= time + 60 ? 0 : cue.start > time + 60 ? 1 : 2;
  return cues.filter((cue) => !completed.has(cue.index))
    .sort((a, b) => rank(a) - rank(b) || (rank(a) === 2 ? b.start - a.start : a.start - b.start) || a.index - b.index)
    .slice(0, Math.max(1, Math.min(50, size)));
}

export function isCurrentRoomRequest(generation: number, currentGeneration: number, identity: string, currentIdentity: string, aborted: boolean): boolean {
  return !aborted && generation === currentGeneration && identity === currentIdentity;
}

export function mapRoomTranslations(cues: RoomCue[], translations: ReadonlyMap<number, string>): RoomCue[] {
  return cues.filter((cue) => translations.has(cue.index))
    .map((cue) => ({ ...cue, text: translations.get(cue.index)! }));
}

/** Subtitle line breaks are visual wrapping, not independent sentences.
 * Translate the whole cue, then restore similar wrapping without duplicating
 * or dropping words. A URL remains a single word and is never split. */
export function reflowRoomTranslation(source: string, translated: string): string {
  const widths = source.split('\n').map((line) => Math.max(1, line.trim().length));
  const words = translated.trim().split(/\s+/u);
  const lineCount = Math.min(widths.length, words.length);
  if (lineCount <= 1) return words.join(' ');
  const lines: string[] = [];
  let cursor = 0;
  for (let line = 0; line < lineCount - 1; line++) {
    const remaining = words.slice(cursor).join(' ').length;
    const totalWidth = widths.slice(line).reduce((sum, width) => sum + width, 0);
    const target = remaining * widths[line] / totalWidth;
    const lastEnd = words.length - (lineCount - line - 1);
    let end = cursor + 1;
    let length = words[cursor].length;
    while (end < lastEnd) {
      const nextLength = length + 1 + words[end].length;
      if (Math.abs(nextLength - target) > Math.abs(length - target)) break;
      length = nextLength;
      end++;
    }
    lines.push(words.slice(cursor, end).join(' '));
    cursor = end;
  }
  lines.push(words.slice(cursor).join(' '));
  return lines.join('\n');
}

export function validateRoomBatch(source: string[], translated: unknown): asserts translated is string[] {
  if (!Array.isArray(translated) || translated.length !== source.length || !source.length) throw new Error('Malformed batch');
  const uniqueSource = new Set(source);
  const uniqueResult = new Set<string>();
  for (let i = 0; i < source.length; i++) {
    const value = translated[i];
    if (typeof value !== 'string' || !value.trim() || value.length > Math.max(2048, source[i].length * 10)
      || /\uFFFD|[\u0000-\u0008\u000B\u000C\u000E-\u001F]|<\|[^>]+\|>/.test(value)
      || /(.{3,})\1{5,}/u.test(value)) throw new Error('Corrupted batch');
    const urls = (text: string) => (text.match(/https?:\/\/[^\s]+|www\.[^\s]+/g) || []).sort();
    const digits = (text: string) => (text.replace(/[٠-٩۰-۹]/g, (digit) => String(digit.charCodeAt(0) - (digit <= '٩' ? 0x660 : 0x6f0))).match(/\d+(?:[.:,]\d+)*/g) || []).sort();
    if (JSON.stringify(urls(source[i])) !== JSON.stringify(urls(value)) || JSON.stringify(digits(source[i])) !== JSON.stringify(digits(value))) throw new Error('Changed numbers or URLs');
    if (/[\u0621-\u064a\u0671-\u06d3][A-Za-z]|[A-Za-z][\u0621-\u064a\u0671-\u06d3]/u.test(value)) throw new Error('Mixed-script corruption');
    uniqueResult.add(value.trim());
  }
  // Repeated source dialogue is legitimate. A collapsed response for several
  // distinct sentences is not; IDs and response cardinality are checked too.
  if (source.length >= 3 && uniqueSource.size >= 3 && uniqueResult.size === 1) throw new Error('Duplicated batch');
}
