/** Cache the small delivered subtitle URL, not megabytes of duplicate cue text. */
export function cacheableCatalogMovie(movie: any): any {
  if (!movie?.__inlineSubtitleUrl) return movie;
  return { ...movie, subtitleText: '', subtitleUrl: movie.__inlineSubtitleUrl, __catalogDetailsRequired: true };
}
