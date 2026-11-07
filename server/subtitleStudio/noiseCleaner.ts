const NOISE_WORDS = [
  'music', 'musical', 'song', 'singing', 'applause', 'clapping', 'laughter', 'laughing',
  'sigh', 'sighs', 'sighing', 'panting', 'breathing', 'gasps', 'gasping', 'crying',
  'sob', 'sobbing', 'cheering', 'inaudible', 'silence', 'noise', 'sound', 'heartbeat',
  'مۆسیقا', 'گۆرانی', 'پێکەنین', 'پێدەکەنێت', 'گریان', 'دەگریێت', 'هەناسە',
  'هەناسە بڕکێ', 'چەپڵە', 'دەنگ', 'بێدەنگی', 'موسيقى', 'ضحك', 'تصفيق', 'بكاء',
  'música', 'risas', 'aplausos', 'musique', 'rires', 'applaudissements',
  'musik', 'lachen', 'applaus', 'müzik', 'kahkaha', 'alkış',
];

const normalizedNoise = NOISE_WORDS.map((word) => word.toLocaleLowerCase());

function isNoiseDescription(value: string): boolean {
  const clean = value.trim().toLocaleLowerCase().replace(/[.:!…-]+$/g, '').trim();
  if (!clean) return true;
  return normalizedNoise.some((word) => clean === word || clean.startsWith(`${word} `) || clean.endsWith(` ${word}`));
}

/** Removes standalone non-speech descriptions while preserving actual dialogue. */
export function cleanSubtitleNoise(input: string): string {
  let text = String(input || '').replace(/<[^>]+>/g, '').replace(/♪+/g, ' ');
  text = text.replace(/\[([^\]]{1,80})\]|\(([^)]{1,80})\)/g, (whole, square, round) =>
    isNoiseDescription(String(square || round || '')) ? ' ' : whole,
  );
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}
