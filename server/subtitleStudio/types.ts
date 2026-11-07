export type SubtitleFormat = 'srt' | 'vtt' | 'transcript';

export interface StudioCue {
  id: string;
  start: number;
  end: number;
  text: string;
  translation?: string;
  failed?: boolean;
}

export interface TranslationResult {
  cueId: string;
  text: string;
  failed?: boolean;
  cached?: boolean;
}
