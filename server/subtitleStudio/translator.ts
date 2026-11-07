import { createHash } from 'node:crypto';
import { GoogleGenAI, Type } from '@google/genai';
import type { StudioCue, TranslationResult } from './types';

const translationCache = new Map<string, string>();

function cacheKey(model: string, text: string, glossary: string): string {
  return createHash('sha256').update(`${model}\n${text}\n${glossary}`).digest('hex');
}

const SYSTEM_PROMPT = `Translate dialogue only into natural contemporary spoken Central Kurdish / Sorani in the Sulaymaniyah style, using Kurdish Arabic script (ڕ ڵ ڤ ۆ ێ ە پ چ ژ گ).
Keep names phonetically and obey the supplied glossary exactly. Keep subtitles concise and readable, and preserve ? ! and emotional tone. Never invent or omit meaning.
Return every cueId exactly once. Never change timestamps. Never output sound effects, music, or bracketed descriptions.`;

function statusOf(error: unknown): number {
  const candidate = error as { status?: number; code?: number; message?: string };
  return Number(candidate?.status || candidate?.code || String(candidate?.message || '').match(/\b(429|5\d\d)\b/)?.[1] || 0);
}

export async function translateCueBatch(cues: StudioCue[], contextCues: StudioCue[], glossary: string): Promise<TranslationResult[]> {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY لە سێرڤەر جێگیر نەکراوە');
  const results = new Map<string, TranslationResult>();
  const pending = cues.filter((cue) => {
    const cached = translationCache.get(cacheKey(model, cue.text, glossary));
    if (cached) results.set(cue.id, { cueId: cue.id, text: cached, cached: true });
    return !cached;
  });
  if (pending.length) {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `Glossary (follow exactly):\n${glossary || '(none)'}\n\nPrevious context (do not translate):\n${JSON.stringify(contextCues.slice(-3).map(({ id, text }) => ({ cueId: id, text })))}\n\nTranslate these cues:\n${JSON.stringify(pending.map(({ id, text }) => ({ cueId: id, text })))}`;
    let response: Awaited<ReturnType<typeof ai.models.generateContent>> | null = null;
    let lastError: unknown;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction: SYSTEM_PROMPT,
            temperature: 0.15,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: { cueId: { type: Type.STRING }, text: { type: Type.STRING } },
                required: ['cueId', 'text'],
              },
            },
          },
        });
        break;
      } catch (error) {
        lastError = error;
        const status = statusOf(error);
        if (attempt === 3 || (status !== 429 && status < 500)) throw error;
        await new Promise((resolve) => setTimeout(resolve, 600 * (2 ** attempt)));
      }
    }
    if (!response) throw lastError instanceof Error ? lastError : new Error('Gemini failed');
    const parsed = JSON.parse(String(response.text || '[]')) as Array<{ cueId?: string; text?: string }>;
    for (const item of parsed) {
      const cue = pending.find((entry) => entry.id === String(item.cueId || ''));
      const text = String(item.text || '').trim();
      if (!cue || !text || results.has(cue.id)) continue;
      translationCache.set(cacheKey(model, cue.text, glossary), text);
      results.set(cue.id, { cueId: cue.id, text });
    }
  }
  return cues.map((cue) => results.get(cue.id) || { cueId: cue.id, text: cue.text, failed: true });
}
