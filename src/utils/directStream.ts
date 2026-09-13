// Shared user-facing strings for the /api/resolve-stream result.
// The server answers `{ok:false, code, message}` with a stable machine code and
// its own (English) reason; the client maps the code to a short Sorani message,
// falling back to English for anything unexpected. Keep this in sync with the
// codes emitted by server.ts (BAD_REQUEST / SOURCE_UNSUPPORTED /
// SOURCE_UNRESOLVABLE / SOURCE_NOT_FOUND / UPSTREAM_FAILURE /
// RESOLVER_UNAVAILABLE / UPSTREAM_TIMEOUT).

const DIRECT_STREAM_MESSAGES: Record<string, string> = {
  SOURCE_UNSUPPORTED: "ئەم سەرچاوەیە بۆ پەخشکردن ڕێگەپێدراو نییە.",
  SOURCE_NOT_FOUND: "ئەم ڤیدیۆیە ئیتر بەردەست نییە.",
  SOURCE_UNRESOLVABLE: "ئەم ڤیدیۆیە ئیتر بەردەست نییە.",
  RESOLVER_UNAVAILABLE: "سێرڤەری ڤیدیۆ ئامادە نییە. تکایە دووبارە هەوڵبدەرەوە.",
  UPSTREAM_TIMEOUT: "سێرڤەری ڤیدیۆ خاو بوو. تکایە دووبارە هەوڵبدەرەوە.",
  UPSTREAM_FAILURE: "سێرڤەری ڤیدیۆ هەڵەی هەیە. تکایە دووبارە هەوڵبدەرەوە.",
  INTERNAL_SERVER_ERROR: "Unable to load the video. Please try again later.",
  BAD_REQUEST: "Unable to load the video. Please try again later.",
};

/**
 * Maps a server stream-resolve failure `code` to a short user-facing message.
 * Unknown/empty codes fall back to a generic (English) retry message.
 */
export function directStreamErrorMessage(code: string): string {
  return DIRECT_STREAM_MESSAGES[code] ?? "Unable to load the video. Please try again later.";
}