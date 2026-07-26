export function getYTId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // YouTube watch?v=VIDEO_ID
  const watch = trimmed.match(/[?&]v=([^#&?\\s]{11})/i);
  if (watch?.[1]) return watch[1];

  // youtu.be/VIDEO_ID
  const short = trimmed.match(/youtu\.be\/([^#&?\\s]{11})/i);
  if (short?.[1]) return short[1];

  // embed/VIDEO_ID
  const embed = trimmed.match(/embed\/([^#&?\\s]{11})/i);
  if (embed?.[1]) return embed[1];

  // /v/VIDEO_ID or /u/VIDEO_ID
  const legacy = trimmed.match(/\/(?:v|u)\/([^#&?\\s]{11})/i);
  if (legacy?.[1]) return legacy[1];

  return null;
}

