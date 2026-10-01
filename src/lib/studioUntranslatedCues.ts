import { stripSubtitleHtmlTags } from "./subtitleText";

const normalizeLine = (text: string) => stripSubtitleHtmlTags(text).trim().replace(/\s+/g, " ").toLowerCase();

/** A missing translation or an English line copied unchanged needs a Sorani retry. */
export function isUntranslatedStudioCue(originalText: string, translatedText: string): boolean {
  const original = stripSubtitleHtmlTags(originalText).trim();
  if (!original) return false; // There is no source to send to Gemini.
  const translated = stripSubtitleHtmlTags(translatedText).trim();
  if (!translated) return true;
  if (!/[a-z]/i.test(original)) return false;

  const translatedLines = new Set(translated.split(/\r?\n/).map(normalizeLine).filter(Boolean));
  return original.split(/\r?\n/).some((line) => {
    const normalized = normalizeLine(line);
    return /[a-z]/i.test(normalized) && translatedLines.has(normalized);
  });
}

export function getUntranslatedStudioBatches<T extends { originalText: string; translatedText: string }>(
  cues: T[], batchSize = 20,
): T[][] {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) throw new Error("Invalid subtitle batch size");
  const pending = cues.filter((cue) => isUntranslatedStudioCue(cue.originalText, cue.translatedText));
  return Array.from({ length: Math.ceil(pending.length / batchSize) }, (_, index) =>
    pending.slice(index * batchSize, (index + 1) * batchSize));
}
