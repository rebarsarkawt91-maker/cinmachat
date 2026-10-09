export function youtubePostId(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    const parts = url.pathname.split('/').filter(Boolean);
    let id: string | null = null;
    if (host === 'youtu.be' || host === 'www.youtu.be') id = parts[0];
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host)) {
      id = parts[0] === 'watch' ? url.searchParams.get('v') : ['embed', 'shorts', 'live'].includes(parts[0]) ? parts[1] : null;
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}

export function createYoutubePost(input: { title: string; url: string; description: string; poster: string; category: string; year: string; duration: string }) {
  const id = youtubePostId(input.url);
  if (!id) throw new Error('تکایە لینکی دروستی ڤیدیۆی YouTube دابنێ.');
  if (!input.title.trim()) throw new Error('ناونیشانی ڤیدیۆ پێویستە.');
  const poster = input.poster.trim() || `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
  if (!/^https?:\/\//i.test(poster)) throw new Error('لینکی وێنە دەبێت http یان https بێت.');
  const url = `https://www.youtube.com/embed/${id}`;
  return {
    title: input.title.trim(), description: input.description.trim(), image: poster, posterUrl: poster,
    videoUrl: url, streamingUrl: url, youtubeMovieUrl: url, external_link: url,
    category: input.category.trim() || 'YouTube', tags: [input.category.trim() || 'YouTube'],
    year: input.year.trim(), duration: input.duration.trim(), type: 'video', postType: 'YouTube', isYouTube: true,
  };
}
