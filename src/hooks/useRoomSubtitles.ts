import { useEffect, useRef, useState } from 'react';
import {
  isCurrentRoomRequest, mapRoomTranslations, parseRoomSubtitleCues, priorityBatch, ROOM_FAILED, ROOM_PREPARING,
  type RoomCue, type RoomSubtitleLanguage,
} from '../lib/roomSubtitleCore';

type Status = 'idle' | 'loading' | 'ready' | 'error';
type State = { identity: string; status: Status; cues: RoomCue[]; original: RoomCue[]; message: string };
const empty: State = { identity: '', status: 'idle', cues: [], original: [], message: '' };

async function request(url: string, body: object, signal: AbortSignal) {
  // Maximum THREE total attempts: immediate, +1s, +2s. The specification's
  // additional 4s delay would require a fourth attempt, so it is not used.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
      if (!response.ok) throw new Error('Subtitle request failed');
      return await response.json();
    } catch (error) {
      if (signal.aborted || attempt === 2) throw error;
      await new Promise<void>((resolve, reject) => {
        const abort = () => { window.clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
        const timer = window.setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 1000 * 2 ** attempt);
        signal.addEventListener('abort', abort, { once: true });
      });
    }
  }
  throw new Error('Subtitle request failed');
}

export function useRoomSubtitles(options: {
  enabled: boolean; roomKey: string; videoId: string; sourceUrl: string; subtitleUrl?: string;
  translatedSubtitleUrl?: string; language: RoomSubtitleLanguage; currentTime: number; retryKey: number;
}) {
  const { enabled, roomKey, videoId, sourceUrl, subtitleUrl = '', translatedSubtitleUrl = '', language, currentTime, retryKey } = options;
  const identity = JSON.stringify([enabled, roomKey, videoId, sourceUrl, subtitleUrl, translatedSubtitleUrl, language, retryKey]);
  const selectedRef = useRef(identity);
  selectedRef.current = identity;
  const timeRef = useRef(currentTime);
  timeRef.current = currentTime;
  const generationRef = useRef(0);
  const [state, setState] = useState<State>(empty);

  useEffect(() => {
    const generation = ++generationRef.current;
    const controller = new AbortController();
    const valid = () => isCurrentRoomRequest(generation, generationRef.current, identity, selectedRef.current, controller.signal.aborted);
    if (!enabled || !sourceUrl) { setState({ ...empty, identity }); return () => controller.abort(); }
    setState({ ...empty, identity, status: 'loading', message: ROOM_PREPARING });
    void (async () => {
      // A pre-generated owner-approved Sorani VTT is already the final product:
      // load it directly instead of trying to recover captions from a sealed
      // cross-origin embed and translating them again.
      if (language === 'ckb' && translatedSubtitleUrl) {
        const response = await fetch(translatedSubtitleUrl, { signal: controller.signal });
        if (!response.ok) throw new Error('Translated subtitle unavailable');
        const cues = parseRoomSubtitleCues(await response.text());
        if (!cues.length) throw new Error('Invalid translated subtitle');
        if (!valid()) return;
        setState({ identity, cues, original: [], status: 'ready', message: '' });
        return;
      }
      const source = await request('/api/room-subtitles/source', { videoId, sourceUrl, subtitleUrl }, controller.signal);
      if (!valid()) return;
      const original: RoomCue[] = source.cues;
      if (!Array.isArray(original) || !original.length) throw new Error('No source captions');
      if (language === 'original') {
        setState({ identity, cues: original, original, status: 'ready', message: '' });
        return;
      }
      const translated = new Map<number, string>();
      setState({ identity, cues: [], original, status: 'loading', message: ROOM_PREPARING });
      while (valid() && translated.size < original.length) {
        // Re-read the live position after every batch. A seek changes the next
        // batch without writing to any video, room, or synchronization state.
        const batch = priorityBatch(original, new Set(translated.keys()), timeRef.current);
        if (!batch.length) break;
        const result = await request('/api/room-subtitles/translate', { trackId: source.trackId, target: language, indices: batch.map((cue) => cue.index) }, controller.signal);
        if (!valid()) return;
        if (!Array.isArray(result.translations) || result.translations.length !== batch.length) throw new Error('Malformed batch');
        const indices = new Set<number>();
        for (const item of result.translations) {
          if (!batch.some((cue) => cue.index === item.index) || indices.has(item.index) || typeof item.text !== 'string' || !item.text.trim()) throw new Error('Malformed batch');
          indices.add(item.index);
        }
        for (const item of result.translations) translated.set(item.index, item.text);
        setState({ identity, original, cues: mapRoomTranslations(original, translated), status: translated.size === original.length ? 'ready' : 'loading', message: translated.size === original.length ? '' : ROOM_PREPARING });
      }
    })().catch(() => {
      if (valid()) setState((previous) => ({ ...previous, identity, status: 'error', message: ROOM_FAILED }));
    });
    return () => controller.abort();
  }, [identity]);

  // Render-time identity gating clears the old language immediately, before
  // effect cleanup runs. Aborted or late callbacks cannot flash old text.
  return state.identity === identity ? state : { ...empty, identity };
}
