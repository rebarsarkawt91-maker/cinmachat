const SITE_ORIGIN = "https://www.cinamachat.com";

export function catalogCardImage(movie: {
  posterUrl?: unknown;
  image?: unknown;
  poster?: unknown;
  poster_url?: unknown;
  coverUrl?: unknown;
  thumbnail?: unknown;
}): string | undefined {
  for (const candidate of [movie.posterUrl, movie.image, movie.poster, movie.poster_url, movie.coverUrl, movie.thumbnail]) {
    if (typeof candidate !== "string") continue;
    const value = candidate.trim().replace(/&amp;/gi, "&").replace(/^\/uploads\//i, "/assets/posters/");
    if ((!value.startsWith("/") && !/^https:\/\//i.test(value)) || value.length > 2048 || value.includes("\\")) continue;
    try {
      const url = new URL(value, SITE_ORIGIN);
      if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) continue;
      if (!url.hostname.includes(".") || /^\d+(?:\.\d+)+$/.test(url.hostname) ||
          /\.(?:local|localhost|internal)$/.test(url.hostname)) continue;
      if ([...url.searchParams.keys()].some(key => /token|signature|credential|secret|password|api[_-]?key|^sig$/i.test(key))) continue;
      if (!url.pathname || url.pathname === "/" || url.pathname.includes("photo-1485846234645-a62644f84728")) continue;
      return url.href;
    } catch {
      // Continue to the next existing poster field if this URL is malformed.
    }
  }
}
