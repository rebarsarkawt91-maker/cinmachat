// Shared banned-keywords censorship used by EVERY chat surface:
//   • Main global broadcast chat (BroadcastRoom)
//   • Drama Rooms (SyncRoom)
//   • Watch-together CinemaChat room (CinemaChatRoom)
//   • Friends Rooms (CameHereRoom / FriendConnectRoom)
//   • Direct messages (DirectMessagesModal)
//
// Matches the app's standard implementation (SyncRoom): each banned keyword
// is replaced case-insensitively by "*" of the same length.
//
// The banned list is deliberately NOT cached for the message check: every call
// fetches the live list from the server (`/api/banned-keywords` reads
// db.bannedKeywords on each request). So when an admin adds or deletes a word
// via the Security Shield panel, the change takes effect on the very next
// message check with no stale-cache window.

const ESCAPE_REGEX = /[-\/\\^$*+?.()|[\]{}]/g;
const escapeRegex = (s: string) => s.replace(ESCAPE_REGEX, "\\$&");

/**
 * Censors `text` by replacing every occurrence of a banned keyword (case
 * insensitive) with "*" repeated for the keyword's length. This mirrors the
 * project's existing standard implementation used across chat surfaces.
 */
export const censorText = (text: string, keywords: string[]): string => {
  let out = String(text || "");
  for (const keyword of keywords) {
    const k = String(keyword || "").trim();
    if (!k) continue;
    try {
      out = out.replace(new RegExp(escapeRegex(k), "gi"), "*".repeat(k.length));
    } catch (err) {
      // Skip keywords that produce an invalid regular expression.
    }
  }
  return out;
};

/**
 * Fetches the current banned-keyword list fresh from the server (no cache)
 * and returns the censored text. Falls back to the original text if the
 * fetch fails, so chat is never blocked by a network error.
 */
export const censorOutgoingMessage = async (text: string): Promise<string> => {
  try {
    const res = await fetch("/api/banned-keywords");
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) return censorText(text, data);
    }
  } catch (err) {
    console.warn("banned keywords fetch failed:", err);
  }
  return String(text || "");
};
