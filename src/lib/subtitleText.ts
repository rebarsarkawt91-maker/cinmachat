/** Remove subtitle presentation markup while leaving dialogue and punctuation untouched. */
export function stripSubtitleHtmlTags(text: string): string {
  return text.replace(/(?:<|&lt;|&amp;lt;)\s*\/?\s*(?:i|b|font)\b[^<>]*?(?:>|&gt;|&amp;gt;)/gi, "");
}
