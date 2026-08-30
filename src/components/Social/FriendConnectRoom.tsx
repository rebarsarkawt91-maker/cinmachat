import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Search,
  Phone,
  Loader2,
  Send,
  PhoneCall,
  AlertCircle,
  BadgeCheck,
  CheckCircle2,
  ArrowRight,
  MessageCircle,
  Users,
  Trash2,
  Play,
  Pause,
  Film,
  Plus,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import {
  createFriendConnection,
  respondToFriendConnection,
  cancelFriendConnection,
  getFriendConnectionBetween,
  searchAccountByCCIdOrContact,
  subscribeConnectionsForUser,
  subscribeWatchCall,
  sendWatchCallInvitation,
  cancelWatchCall,
  friendPairKey,
  maskInvitePhone,
} from "../../services/friendConnect";
import type {
  ContactSearchResult,
  FriendConnection,
  WatchCall,
} from "../../services/friendConnect";
import { censorOutgoingMessage } from "../../services/bannedWords";
import { PrivateChatClient, fetchPrivateSessionId } from "../../services/privateChatClient";
import type { PrivateChatMessage, MovieSyncPayload } from "../../services/privateChatClient";
import { resolveMovieSourceUrl } from "../../services/cinemaChat";
import { db, collection, getDocs } from "../../lib/firebase";
import type { AccountReadiness } from "../../services/accountReadiness";

// ---------------------------------------------------------------------------
// Friend → Connect private 1-to-1 flow (replaces the old general chat flow).
//
//   FRIEND 1   search by phone number or CC-ID → found card → پێشەوە (NEXT)
//   CONNECT 2  invitation sent → waiting for acceptance → auto-open on accept
//   CHAT       3  private ephemeral chat (server in-memory session only)
//   MOVIE      4  movie / watch-party selection within the active chat
//
// Watching-together calls: answering a "Call Invitation" ring anywhere in the
// app opens this room with autoConnect (callId + connectionId). The room then
// subscribes to the accepted call's doc in real time and joins THAT connection
// deterministically (Step 3) the moment its pair flips "accepted" — on both
// sides the CALLER drives it from its own activeCall, the RECEIVER from the
// autoConnect identity. No fuzzy "latest accepted" guess is ever involved.
//
// NO general/global chat lives here: every message is scoped to the accepted
// connection's private session, and messages are held ONLY in React state —
// cleared on leave/close/re-open, never persisted anywhere.
//
// NO ACCOUNT GATE: "OPEN WATCH TOGETHER" must land straight on FRIEND 1
// (friend search / هاوڕێیەک بدۆزەوە) for guests, while auth/profile is still
// resolving, and even when the profile is missing required fields. Safe default
// metadata (myName/myCode/myAvatar) keeps every downstream write null-safe, and
// guest searches can BROWSE freely — only actually sending a connection or a
// watch-call ring prompts classic sign-in (requireAccount). Firestore listeners
// open as soon as a real uid exists; nothing waits on readiness.
// ---------------------------------------------------------------------------

interface FriendConnectRoomProps {
  open: boolean;
  onClose: () => void;
  myUid: string;
  myName: string;
  myCode: string;
  myAvatar?: string;
  /** Shared account-readiness result (checking|guest|authenticated-incomplete|ready|error).
   *  Readiness/profile checks are BYPASSED in this room — "OPEN WATCH TOGETHER"
   *  must open Step 1 (friend search) directly with safe default metadata even
   *  when this prop is null/undefined on initial load. Kept optional only for
   *  parent-signal compatibility; the room never gates rendering on it. */
  readiness?: AccountReadiness;
  /** App root keeps the currently active private room id so a watch-call accept
   *  can reopen the same room immediately. This is the deterministic room key
   *  for the shared call between both peers. */
  activeRoomId?: string;
  /** When a "Call Invitation" ring was answered, the accepted call's identity.
   *  The room then joins THAT connection's private chat deterministically —
   *  never a guessed "latest accepted" pair — even mid-search. Empty when the
   *  room was opened manually. */
  autoConnectCallId?: string;
  autoConnectConnectionId?: string;
  /** Parent notification that the deterministic join was consumed, so the
   *  pending call identity can be cleared (a later manual open must not be
   *  re-routed into the same chat). */
  onAutoConnectConsumed?: () => void;
  onRequestAccount?: () => void;
  onRetryAuth?: () => void;
  onCompleteAccount?: () => void;
}

interface DisplayMessage extends PrivateChatMessage {
  mine: boolean;
  confirmed: boolean;
}

/** Compact movie descriptor exchanged between the two watch-together peers. */
interface SyncedMovie {
  id: string;
  title: string;
  image?: string;
  url: string;
}

const formatPlayTime = (s: number): string => {
  const secs = Number.isFinite(s) && s > 0 ? Math.floor(s) : 0;
  const m = Math.floor(secs / 60);
  return `${String(m).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
};

type SearchStatus = "idle" | "searching" | "found" | "error";

const generateClientId = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `m_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

export const FriendConnectRoom: React.FC<FriendConnectRoomProps> = (props) => {
  const {
    open,
    onClose,
    myUid: myUidProp,
    myName: myNameProp,
    myCode: myCodeProp,
    myAvatar: myAvatarProp,
    activeRoomId: activeRoomIdProp,
    autoConnectCallId: autoConnectCallIdProp,
    autoConnectConnectionId: autoConnectConnectionIdProp,
    onAutoConnectConsumed,
    onRequestAccount,
  } = props;

  // Safe metadata fallbacks: the parent always passes strings, but a
  // missing/empty/guest account must never crash Step 1 (friend search) or
  // leak raw "undefined" into Firestore writes. Resolve safe values ONCE here
  // and let every downstream read (search, invitations, chat) use them.
  const myUid = String(myUidProp || "").trim();
  const myName = String(myNameProp || "").trim() || "بەکارهێنەر";
  const myCode = String(myCodeProp || "").trim();
  const myAvatar = myAvatarProp || null;

  const [tab, setTab] = useState<"phone">("phone");
  const [input, setInput] = useState("");
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [found, setFound] = useState<ContactSearchResult | null>(null);
  const [foundConn, setFoundConn] = useState<FriendConnection | null>(null);
  const [nextBusy, setNextBusy] = useState(false);

  // --- Watch-together movie sync (real-time relay over the private-chat socket) ---
  const [roomMovie, setRoomMovie] = useState<SyncedMovie | null>(null);
  const [moviePlaying, setMoviePlaying] = useState(false);
  const [movieTime, setMovieTime] = useState(0);
  const [movieDuration, setMovieDuration] = useState(0);
  const [moviePickerOpen, setMoviePickerOpen] = useState(false);
  const [movieQuery, setMovieQuery] = useState("");
  const [movieCatalog, setMovieCatalog] = useState<any[] | null>(null);
  const [movieCatLoading, setMovieCatLoading] = useState(false);
  const movieVideoRef = useRef<HTMLVideoElement | null>(null);
  const movieSeqRef = useRef(0);
  const lastRemoteSeqRef = useRef(0);
  const pendingSeekRef = useRef<number | null>(null);
  const movieCatFetchedRef = useRef(false);

  // "Call Invitation" (watch-together ring) state for the found peer. The ring
  // signal lives in the invitations collection (kind: "watchcall"); we keep the
  // caller's own doc id + live status here so the card can show Ringing → done.
  const [activeCall, setActiveCall] = useState<WatchCall | null>(null);
  const [callBusy, setCallBusy] = useState(false);

  // Deterministic join state (receiver side after answering a "Call
  // Invitation" ring): the accepted call's live doc + whether the join has
  // already been performed (so a later manual open is never re-routed).
  const [joinCall, setJoinCall] = useState<WatchCall | null>(null);
  const [joinConsumed, setJoinConsumed] = useState(false);
  const onAutoConnectConsumedRef = useRef(onAutoConnectConsumed);
  onAutoConnectConsumedRef.current = onAutoConnectConsumed;

  // All connections involving me (both directions) — the real-time source of
  // truth for incoming asks + status transitions.
  const [connections, setConnections] = useState<FriendConnection[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Chat state (ephemeral — in-memory only).
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [peerOnline, setPeerOnline] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const [chatConnecting, setChatConnecting] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);

  const clientRef = useRef<PrivateChatClient | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ---- derived state -------------------------------------------------------
  const activeConn = useMemo(
    () => connections.find((c) => c.id === activeId) ?? null,
    [connections, activeId],
  );

  // Live connection for the peer that is CURRENTLY on the found friend card,
  // so status transitions (pending ask / call accepted → chat) reflect in real
  // time instead of the snapshot taken at search time.
  const liveFoundConn = useMemo(
    () => {
      if (!found) return foundConn;
      const key = friendPairKey(myUid, found.uid);
      return connections.find((c) => c.id === key) ?? foundConn;
    },
    [connections, found, foundConn, myUid],
  );
  const incomingPending = useMemo(
    () =>
      connections.filter(
        (c) => c.status === "pending" && c.targetUid === myUid,
      ),
    [connections, myUid],
  );
  const outgoingPending = useMemo(
    () =>
      connections.filter(
        (c) => c.status === "pending" && c.requesterUid === myUid,
      ),
    [connections, myUid],
  );
  const inChat = !!activeConn && activeConn.status === "accepted";
  const peerOf = useCallback(
    (conn: FriendConnection | null): { name: string; code: string; avatar?: string } => {
      if (!conn) return { name: "", code: "" };
      const peerIsRequester = conn.requesterUid === myUid;
      return {
        name: peerIsRequester ? conn.targetName : conn.requesterName,
        code: peerIsRequester ? conn.targetCode : conn.requesterCode,
        avatar: peerIsRequester ? conn.targetAvatar || undefined : conn.requesterAvatar || undefined,
      };
    },
    [myUid],
  );
  const activePeer = peerOf(activeConn);

  // ---- subscriptions -------------------------------------------------------
  // Firestore listeners start as soon as the room is open with a real uid — NO
  // readiness/profile gate. "OPEN WATCH TOGETHER" must land on Step 1 (friend
  // search) immediately; an incomplete or still-resolving profile cannot block
  // the live connection stream.
  useEffect(() => {
    if (!open || !myUid) return;
    const unsub = subscribeConnectionsForUser(
      myUid,
      (list) => setConnections(list),
      () => {},
    );
    return unsub;
  }, [open, myUid]);

  // Live status of OUR outgoing "Call Invitation" ring (doc-level listener —
  // no composite index needed, and answers/declines update in real time).
  const activeCallId = activeCall?.id ?? null;
  useEffect(() => {
    if (!open || !activeCallId) return;
    const unsub = subscribeWatchCall(
      activeCallId,
      (call) => setActiveCall((current) => (current?.id === call?.id ? call : current)),
      () => {},
    );
    return unsub;
  }, [open, activeCallId]);

  // Auto-open the most recent accepted connection (e.g. right after the other
  // side accepts while the room is open on the target's device).
  //
  // Guard: while a found-friend card is on screen (searchStatus === "found")
  // we NEVER auto-jump — a background `connections` snapshot arriving after the
  // search used to flip `foundPeerAccepted` (when the found peer was already an
  // accepted friend) and swap the friend step for the chat, making the card
  // vanish ~1s later. The card stays until the user acts: پێشەوە / کردنەوەی چات,
  // "هاوڕێیەکی تر هەڵبژێرە" or clearing the input (which sets idle).
  useEffect(() => {
    if (!open || activeId) return;
    // A call-accept join is pending — never fall back to the fuzzy "latest
    // accepted" pick (it could open a DIFFERENT chat). Wait for the join.
    if (autoConnectConnectionIdProp && !joinConsumed) return;
    if (searchStatus === "searching" || searchStatus === "found") return;
    const accepted = connections.filter((c) => c.status === "accepted");
    if (accepted.length === 0) return;
    const latest = [...accepted].sort((a, b) =>
      (b.acceptedAt || b.updatedAt || "").localeCompare(a.acceptedAt || a.updatedAt || ""),
    )[0];
    setActiveId(latest.id);
  }, [open, activeId, connections, searchStatus, autoConnectConnectionIdProp, joinConsumed]);

  // A "Call Invitation" the peer accepted streams its invitation doc to
  // status === "accepted". THAT explicit answer is the only auto-advance off
  // the found friend card (a background accepted pair still never jumps the
  // card): the caller transitions straight into the shared private chat so both
  // sides land in the same room together. We wait for the accepted pair to show
  // up in the local snapshot so the chat step never renders without a peer.
  useEffect(() => {
    if (!open || activeId || !activeCall || activeCall.status !== "accepted") return;
    const target = activeCall.connectionId;
    if (!target) return;
    const conn = connections.find((c) => c.id === target);
    // Edge case: the receiver's best-effort ensure created the pair UNDER THEM
    // as requester (the caller's own send-side ensure failed / pair was
    // deleted), so it arrives here as a PENDING incoming ask. Only the TARGET
    // may accept it — that is the caller — so mirror-accept it to unlock the
    // shared private session (the server refuses non-accepted pairs), then the
    // next snapshot lets the advance below proceed.
    if (conn && conn.status === "pending" && conn.targetUid === myUid) {
      void respondToFriendConnection(target, "accepted").catch(() => {});
      return;
    }
    if (!conn || conn.status !== "accepted") return;
    setActiveId(target);
    setSearchStatus("idle");
    setActiveCall(null);
  }, [open, activeId, activeCall, connections, myUid]);

  // Deterministic join after answering a "Call Invitation" ring (RECEIVER
  // side). WatchCallNotification → App pass autoConnect (callId + connectionId);
  // this room subscribes to the accepted call's own doc in real time and, once
  // BOTH the call is "accepted" AND its pair shows "accepted" in the local
  // connections snapshot, jumps straight into that connection's Step-3 chat —
  // clearing any leftover found-friend card without ever guessing a connection.
  const joinCallId = autoConnectCallIdProp ?? null;
  const joinConnId = autoConnectConnectionIdProp ?? activeRoomIdProp ?? null;
  useEffect(() => {
    if (!open || !joinCallId) return;
    setJoinCall(null);
    const unsub = subscribeWatchCall(joinCallId, (call) => setJoinCall(call), () => {});
    return unsub;
  }, [open, joinCallId]);

  // Reset the consumed flag whenever a (new) call is queued, so a fresh accept
  // on a later ring joins again instead of being blocked by an old join.
  useEffect(() => {
    setJoinConsumed(false);
  }, [autoConnectCallIdProp]);

  useEffect(() => {
    if (!open || joinConsumed) return;
    if (!joinCallId || !joinConnId) return;
    if (!joinCall || joinCall.status !== "accepted") return;
    const conn = connections.find((c) => c.id === joinConnId);
    if (!conn || conn.status !== "accepted") return;
    setActiveId(joinConnId);
    setSearchStatus("idle");
    setFound(null);
    setFoundConn(null);
    setJoinConsumed(true);
    onAutoConnectConsumedRef.current?.();
  }, [open, joinCallId, joinConnId, joinCall, connections, joinConsumed]);

  // Receiver-side root sync: if the app reopened the room with a known shared
  // room id before the Firestore listener settles, we still jump immediately to
  // the accepted private connection instead of waiting for a second click.
  useEffect(() => {
    if (!open || joinConsumed) return;
    const resolvedRoomId = joinConnId || activeRoomIdProp || null;
    if (!resolvedRoomId) return;
    const conn = connections.find((c) => c.id === resolvedRoomId);
    if (!conn || conn.status !== "accepted") return;
    setActiveId(resolvedRoomId);
    setSearchStatus("idle");
    setFound(null);
    setFoundConn(null);
    setJoinConsumed(true);
    onAutoConnectConsumedRef.current?.();
  }, [open, activeRoomIdProp, joinConnId, connections, joinConsumed]);

  // Fresh 1-to-1 chat → start watch-together state clean (preserved across
  // close/re-open of the SAME connection so a paused pair resumes where it was).
  const lastConnIdRef = useRef<string | null>(null);
  useEffect(() => {
    const cid = activeConn?.id ?? null;
    if (lastConnIdRef.current === cid) return;
    lastConnIdRef.current = cid;
    if (!cid) return;
    setRoomMovie(null);
    setMoviePlaying(false);
    setMovieTime(0);
    setMovieDuration(0);
    setMoviePickerOpen(false);
    setMovieQuery("");
    movieSeqRef.current = 0;
    lastRemoteSeqRef.current = 0;
    pendingSeekRef.current = null;
  }, [activeConn?.id]);

  // If the active connection is closed (rejected/cancelled), drop it back to
  // the friend search step.
  useEffect(() => {
    if (
      activeId &&
      activeConn &&
      (activeConn.status === "rejected" || activeConn.status === "cancelled")
    ) {
      setActiveId(null);
    }
  }, [activeId, activeConn]);

  // ---- chat lifecycle ------------------------------------------------------
  const tearDownClient = useCallback((sendLeave: boolean) => {
    const client = clientRef.current;
    if (client) {
      if (sendLeave) client.leave();
      else client.close("closed");
      clientRef.current = null;
    }
    setMessages([]);
    setPeerOnline(false);
    setPeerTyping(false);
    setChatError(null);
    setSessionEnded(false);
    setChatConnecting(false);
  }, []);

  useEffect(() => {
    if (!open || !inChat || !activeConn) return;
    let cancelled = false;
    setChatConnecting(true);
    setChatError(null);
    setSessionEnded(false);
    setPeerOnline(false);

    const client = new PrivateChatClient();
    clientRef.current = client;

    client.onEvent = (event) => {
      if (cancelled) return;
      if (event.type === "message") {
        if (event.ack) {
          // Own optimistic message confirmed by the server.
          setMessages((prev) =>
            prev.map((m) =>
              m.clientId === event.clientId ? { ...m, ts: event.ts, confirmed: true } : m,
            ),
          );
        } else {
          setMessages((prev) =>
            prev.some((m) => m.clientId === event.clientId)
              ? prev
              : [...prev, { ...event, mine: false, confirmed: true }],
          );
        }
      } else if (event.type === "presence") {
        setPeerOnline(event.online);
      } else if (event.type === "typing") {
        setPeerTyping(event.typing);
      } else if (event.type === "movie") {
        handleRemoteMovieRef.current(event.payload);
      } else if (event.type === "session_closed") {
        setSessionEnded(true);
        setPeerOnline(false);
        client.close("closed");
      }
    };

    client.onClosed = () => {
      if (cancelled) return;
      setPeerOnline(false);
      setSessionEnded(true);
      setChatConnecting(false);
    };

    void (async () => {
      try {
        const sessionId = await fetchPrivateSessionId(activeConn.id);
        if (cancelled) return;
        client.connect(sessionId);
        setChatConnecting(false);
      } catch {
        if (!cancelled) {
          setChatError("دەستپێکردنی دانیشتن سەرکەوتوو نەبوو؛ دووبارە هەوڵبدە");
          setSessionEnded(true);
          setChatConnecting(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      const c = clientRef.current;
      if (c) {
        c.close("closed");
        clientRef.current = null;
      }
    };
  }, [open, inChat, activeConn?.id, activeConn?.status]);

  // Keep the chat scrolled to the newest message.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, peerTyping]);

  // Cleanup everything when the room closes.
  useEffect(() => {
    if (!open) tearDownClient(false);
  }, [open, tearDownClient]);

  // ---- handlers ------------------------------------------------------------

  /** A guest (no Firebase uid) may BROWSE the friend-search step — clicking
   *  "OPEN WATCH TOGETHER" always lands there — but writing a real connection
   *  or watch-call ring still needs a real account. Prompt classic sign-in
   *  instead of creating an invalid document under an empty requesterUid. */
  const requireAccount = useCallback(
    (message: string): boolean => {
      if (myUid) return true;
      setSearchError(message);
      onRequestAccount?.();
      return false;
    },
    [myUid, onRequestAccount],
  );

  const handleSearch = useCallback(async () => {
    const raw = input.trim();
    // STRICT CARD LOCK: once a match is on screen ("found") the search is
    // considered dismissed — pressing Enter / گەڕان again must NOT re-run or
    // reset the state (that used to wipe the card on key-replay / accidental
    // re-submit). The found card persists until Cancel or full text deletion.
    if (!raw || searchStatus === "searching" || searchStatus === "found") return;
    // A ring still active while searching another peer must not linger.
    if (activeCall?.status === "calling") void cancelWatchCall(activeCall.id).catch(() => {});
    setActiveCall(null);
    setFound(null);
    setFoundConn(null);
    setSearchError(null);
    setSearchStatus("searching");
    try {
      const result = await searchAccountByCCIdOrContact(raw);
      if (!result) {
        setSearchStatus("error");
        setSearchError("هیچ ئەکاونتێک بەم ژمارەیە/CC-ID نەدۆزرایەوە");
        return;
      }
      if (result.uid === myUid) {
        setSearchStatus("error");
        setSearchError("ئەمە هەژمارەی خۆتە؛ ژمارە/CC-ID ی هاوڕێکەت بنووسە");
        return;
      }
      // Commit the matched card FIRST and irrevocably. Everything below is only
      // enrichment and can NEVER revert `searchStatus` back to error/idle.
      setFound(result);
      setSearchStatus("found");
      try {
        // Existing relationship with this peer (labels the primary button).
        const existing = await getFriendConnectionBetween(myUid, result.uid);
        if (existing) setFoundConn(existing);
      } catch (err) {
        // A background relationship lookup failing (e.g. transient live rules /
        // network) must NOT remove or hide the already-found card.
        console.warn("friend connection lookup failed after search:", err);
      }
    } catch {
      // Only a FAILED search itself lands in "error" — never a post-found step.
      setSearchStatus("error");
      setSearchError("دۆزینەوە سەرکەوتوو نەبوو؛ دووبارە هەوڵبدە");
    }
  }, [input, myUid, searchStatus, activeCall]);

  const chooseAnother = useCallback(() => {
    if (activeCall?.status === "calling") void cancelWatchCall(activeCall.id).catch(() => {});
    setActiveCall(null);
    setFound(null);
    setFoundConn(null);
    setSearchStatus("idle");
    setSearchError(null);
    setInput("");
  }, [activeCall]);

  const handleNext = useCallback(async () => {
    if (!found || nextBusy) return;
    if (!requireAccount("بۆ بانگهێشتکردنی هاوڕێ پێویستە ئەکاونتێکی هەبێت")) return;
    setNextBusy(true);
    try {
      const { id } = await createFriendConnection({
        requesterUid: myUid,
        requesterName: myName,
        requesterCode: myCode,
        requesterAvatar: myAvatar || null,
        target: found,
      });
      // Stop any ringing call so the recipient is not left ringing forever.
      if (activeCall?.status === "calling") void cancelWatchCall(activeCall.id).catch(() => {});
      setActiveCall(null);
      setActiveId(id);
      setSearchStatus("idle");
    } catch {
      setSearchError("ناردنی بانگهێشت سەرکەوتوو نەبوو؛ دووبارە هەوڵ بدە");
    } finally {
      setNextBusy(false);
    }
  }, [found, myUid, myName, myCode, myAvatar, nextBusy, activeCall, requireAccount]);

  // "Call Invitation" — an immediate real-time watch-together ring to the found
  // friend. It (re)uses the peer's friend_connections pair as the chat that is
  // opened once the receiver answers, and plants the "calling" ring doc that
  // the global WatchCallNotification surfaces anywhere in the app.
  const handleCallInvitation = useCallback(async () => {
    if (!found || callBusy) return;
    if (activeCall?.status === "calling") return;
    if (!requireAccount("بۆ ناردنی بانگهێشتی پەیوەندی پێویستە ئەکاونتێکی هەبێت")) return;
    setCallBusy(true);
    setSearchError(null);
    try {
      const { callId, connectionId } = await sendWatchCallInvitation({
        requesterUid: myUid,
        requesterName: myName,
        requesterCode: myCode,
        requesterAvatar: myAvatar || null,
        target: found,
      });
      // Provisional "calling" state — the doc-level listener streams the real
      // invitation doc (answered/declined) right after creation.
      setActiveCall({
        id: callId,
        kind: "watchcall",
        status: "calling",
        fromId: myUid,
        fromName: myName,
        fromCode: myCode,
        fromAvatar: myAvatar || null,
        toId: found.uid,
        toName: found.name,
        toCode: found.uniqueCode,
        connectionId,
        startedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });
    } catch {
      setSearchError("ناردنی بانگهێشتی پەیوەندی سەرکەوتوو نەبوو؛ دووبارە هەوڵ بدە");
    } finally {
      setCallBusy(false);
    }
  }, [found, callBusy, activeCall, myUid, myName, myCode, myAvatar, requireAccount]);

  const handleCancelCall = useCallback(async () => {
    if (!activeCall || activeCall.status !== "calling") return;
    setCallBusy(true);
    try {
      await cancelWatchCall(activeCall.id);
      setActiveCall((c) => (c ? { ...c, status: "ended" } : c));
    } catch {
      setSearchError("ڕاگرتنی بانگهێشتی پەیوەندی سەرکەوتوو نەبوو؛ دووبارە هەوڵ بدە");
    } finally {
      setCallBusy(false);
    }
  }, [activeCall, callBusy]);

  const handleAccept = useCallback(
    async (conn: FriendConnection) => {
      setNextBusy(true);
      try {
        await respondToFriendConnection(conn.id, "accepted");
        setActiveId(conn.id);
      } catch {
        setSearchError("قبووڵکردن سەرکەوتوو نەبوو؛ دووبارە هەوڵ بدە");
      } finally {
        setNextBusy(false);
      }
    },
    [],
  );

  const handleReject = useCallback(
    async (conn: FriendConnection) => {
      setNextBusy(true);
      try {
        await respondToFriendConnection(conn.id, "rejected");
        if (activeId === conn.id) setActiveId(null);
      } catch {
        setSearchError("ڕەتکردنەوە سەرکەوتوو نەبوو؛ دووبارە هەوڵ بدە");
      } finally {
        setNextBusy(false);
      }
    },
    [activeId],
  );

  const handleCancel = useCallback(async () => {
    if (!activeConn || activeConn.status !== "pending") return;
    setNextBusy(true);
    try {
      await cancelFriendConnection(activeConn.id);
      setActiveId(null);
    } catch {
      setSearchError("ڕاگرتن سەرکەوتوو نەبوو؛ دووبارە هەوڵ بدە");
    } finally {
      setNextBusy(false);
    }
  }, [activeConn]);

  const handleSend = useCallback(async () => {
    const raw = newMessage.trim();
    if (!raw || !clientRef.current) return;
    const censored = await censorOutgoingMessage(raw);
    const text = censored;
    const clientId = generateClientId();
    setMessages((prev) => [
      ...prev,
      { clientId, senderId: myUid, text, ts: Date.now(), mine: true, confirmed: false },
    ]);
    setNewMessage("");
    clientRef.current.send(text, clientId);
    clientRef.current.sendTyping(false);
  }, [newMessage, myUid]);

  const handleTyping = useCallback(
    (typing: boolean) => {
      clientRef.current?.sendTyping(typing);
    },
    [],
  );

  const handleLeave = useCallback(() => {
    tearDownClient(true);
    setActiveId(null);
  }, [tearDownClient]);

  const maskedContact = useMemo(() => {
    if (!found) return "";
    return maskInvitePhone(found.phone || found.email);
  }, [found]);

  // ---- render --------------------------------------------------------------
  if (!open) return null;

  const renderPeerBadge = (conn: FriendConnection) => {
    const peer = peerOf(conn);
    return (
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-11 h-11 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-white text-sm font-black overflow-hidden flex-shrink-0">
          {peer.avatar ? (
            <img src={peer.avatar} alt={peer.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            (peer.name || "?").slice(0, 1).toUpperCase()
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-black text-white kurdish-text truncate">{peer.name}</p>
          <p className="text-[10px] text-emerald-300 font-mono truncate">{peer.code}</p>
        </div>
      </div>
    );
  };

  const renderIncomingSection = () => {
    if (incomingPending.length === 0) return null;
    return (
      <div className="mb-5" dir="rtl">
        <p className="text-[11px] font-black text-amber-400 kurdish-text mb-2 flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5" />
          بانگهێشتی وەردەگریت ({incomingPending.length})
        </p>
        <div className="space-y-2">
          {incomingPending.map((conn) => {
            const peer = peerOf(conn);
            return (
              <div key={conn.id} className="rounded-2xl border border-amber-400/25 bg-amber-400/5 p-3 flex items-center gap-3">
                {renderPeerBadge(conn)}
                <div className="flex items-center gap-2 flex-shrink-0 mr-auto">
                  <button
                    type="button"
                    disabled={nextBusy}
                    onClick={() => handleAccept(conn)}
                    className="px-3 py-2 rounded-xl bg-emerald-500/90 hover:bg-emerald-500 text-white text-[11px] font-black kurdish-text flex items-center gap-1.5 transition-all disabled:opacity-50"
                  >
                    {nextBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    قبووڵکردن
                  </button>
                  <button
                    type="button"
                    disabled={nextBusy}
                    onClick={() => handleReject(conn)}
                    className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-[11px] font-black kurdish-text transition-all disabled:opacity-50"
                  >
                    ڕەتکردنەوە
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderOutgoingSection = () => {
    if (outgoingPending.length === 0) return null;
    return (
      <div className="mb-5" dir="rtl">
        <p className="text-[11px] font-black text-sky-400 kurdish-text mb-2 flex items-center gap-2">
          <Send className="w-3.5 h-3.5" />
          بانگهێشتی ڕەوانەکراو — چاوەڕوانی وەرگرتن
        </p>
        <div className="space-y-2">
          {outgoingPending.map((conn) => {
            const peer = peerOf(conn);
            return (
              <div key={conn.id} className="rounded-2xl border border-white/10 bg-white/5 p-3 flex items-center gap-3">
                {renderPeerBadge(conn)}
                <button
                  type="button"
                  disabled={nextBusy}
                  onClick={async () => {
                    setNextBusy(true);
                    try {
                      await cancelFriendConnection(conn.id);
                    } catch {
                      /* best-effort cancel */
                    } finally {
                      setNextBusy(false);
                    }
                  }}
                  className="ml-auto flex-shrink-0 px-3 py-2 rounded-xl bg-white/5 hover:bg-red-500/20 border border-white/10 text-gray-300 hover:text-red-300 text-[11px] font-black kurdish-text flex items-center gap-1.5 transition-all disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  ڕاگرتن
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderFriendStep = () => (
    <div dir="rtl">
      {renderIncomingSection()}
      {renderOutgoingSection()}

      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base font-black text-white kurdish-text">هاوڕێیەک بدۆزەوە</h3>
          <p className="text-[11px] text-gray-500 kurdish-text mt-1">
            بە ژمارەی مۆبایل یان کۆدی CC-ID، هەژماری هاوڕێکەت بدۆزەرەوە.
          </p>
        </div>
        <Users className="w-5 h-5 text-brand-primary flex-shrink-0" />
      </div>

      <div className="grid grid-cols-1 gap-2 mb-3">
        {(
          [
            { id: "phone" as const, label: "ژمارەی مۆبایل یان کۆدی CC-ID", icon: Phone },
          ]
        ).map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTab(item.id);
                chooseAnother();
              }}
              className={`min-h-[52px] rounded-2xl border flex items-center justify-center gap-2 text-[11px] font-black transition-all ${
                active
                  ? "bg-brand-primary text-white border-brand-primary shadow-lg shadow-red-600/20"
                  : "bg-black/30 text-gray-400 border-white/10 hover:bg-white/5"
              }`}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            // STRICT persistence: an onChange/typing event NEVER hides a found
            // card. The only dismissal paths are the explicit "پاشگەزبوونەوە"
            // Cancel, "هاوڕێیەکی تر" (choose another), گەڕان advancing, or the
            // user deleting the entire search text (back to the idle box).
            if (e.target.value.trim() === "") {
              if (searchStatus !== "idle") {
                setSearchStatus("idle");
                setSearchError(null);
              }
            } else if (searchStatus === "error") {
              // Errors may clear as soon as the user edits the input; the found
              // CARD does not — it persists until Cancel or full deletion.
              setSearchError(null);
              setSearchStatus("idle");
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              // There is no form here, but guard the Enter replay explicitly so
              // a submit-style key stroke can never default + reset the locked
              // found card.
              if (searchStatus === "found") {
                e.preventDefault();
                return;
              }
              void handleSearch();
            }
          }}
          type="tel"
          inputMode="tel"
          placeholder="بۆ نموونە: 0750 123 4567 یان CC-8291"
          className="flex-1 min-w-0 px-4 py-3 rounded-2xl bg-black/40 border border-white/10 focus:border-brand-primary/60 outline-none text-sm text-white placeholder:text-gray-600"
        />
        <button
          type="button"
          onClick={() => void handleSearch()}
          disabled={!input.trim() || searchStatus === "searching" || searchStatus === "found"}
          className="px-5 py-3 rounded-2xl bg-brand-primary hover:bg-red-700 text-white text-xs font-black kurdish-text flex items-center justify-center gap-2 transition-all disabled:opacity-50 flex-shrink-0"
        >
          {searchStatus === "searching" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
          گەڕان
        </button>
      </div>

      {searchStatus === "error" && searchError && (
        <p className="mt-3 flex items-center gap-2 text-[11px] font-bold text-amber-400 kurdish-text">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {searchError}
        </p>
      )}

      {searchStatus === "found" && found && (
        <div className="mt-4 rounded-3xl border border-emerald-500/25 bg-emerald-500/10 p-4" dir="rtl">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-white text-base font-black overflow-hidden flex-shrink-0">
                {found.avatarUrl ? (
                  <img src={found.avatarUrl} alt={found.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  (found.name || "?").slice(0, 1).toUpperCase()
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black text-white kurdish-text truncate">{found.name}</p>
                <p className="text-[11px] text-emerald-300 font-mono truncate">{found.uniqueCode}</p>
                {maskedContact && (
                  <p className="text-[10px] text-gray-400 font-mono truncate">{maskedContact}</p>
                )}
              </div>
            </div>
            <BadgeCheck className="w-6 h-6 text-emerald-400 flex-shrink-0" />
          </div>

          {searchError && (
            <p className="mb-3 flex items-center gap-2 text-[11px] font-bold text-amber-400 kurdish-text">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {searchError}
            </p>
          )}

          {/* Call Invitation — instant real-time watch-together ring to this
              friend (surfaced globally by WatchCallNotification on their side) */}
          <div className="mb-3">
            {activeCall?.status === "calling" ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled
                  className="flex-1 px-5 py-3 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-black kurdish-text flex items-center justify-center gap-2 cursor-default"
                >
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-400" />
                  </span>
                  دەڕۆێت... (Ringing)
                </button>
                <button
                  type="button"
                  onClick={() => void handleCancelCall()}
                  disabled={callBusy}
                  title="ڕاگرتنی بانگهێشتی پەیوەندی"
                  className="px-4 py-3 rounded-2xl bg-white/5 hover:bg-red-500/20 border border-white/10 text-gray-300 transition-all disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void handleCallInvitation()}
                disabled={callBusy}
                title="بانگهێشتی پەیوەندی — سەیرکردنی فیلم پێکەوە (Watch Together)"
                className="w-full px-5 py-3 rounded-2xl bg-sky-500/15 hover:bg-sky-500/30 border border-sky-500/30 text-sky-300 text-xs font-black kurdish-text flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {callBusy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <PhoneCall className="w-4 h-4" />
                )}
                Call Invitation
              </button>
            )}
            {(activeCall?.status === "declined" || activeCall?.status === "ended") && (
              <p className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-amber-400 kurdish-text">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {activeCall.status === "declined"
                  ? "بانگهێشتی پەیوەندی ڕەتکرایەوە — دووبارە هەوڵ بدە"
                  : "بانگهێشتی پەیوەندی ڕاگیرا"}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
            <button
              type="button"
              onClick={() => void handleNext()}
              disabled={nextBusy}
              className="px-5 py-3 rounded-2xl bg-brand-primary hover:bg-red-700 text-white text-xs font-black kurdish-text flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              {nextBusy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowRight className="w-4 h-4" />
              )}
              {liveFoundConn?.status === "accepted"
                ? "کردنەوەی چات"
                : liveFoundConn?.status === "pending"
                  ? "سەیرکردنی بانگهێشت"
                  : "پێشەوە"}
            </button>
            <button
              type="button"
              onClick={chooseAnother}
              className="px-5 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-xs font-black kurdish-text transition-all"
            >
              هاوڕێیەکی تر هەڵبژێرە
            </button>
          </div>

          {/* Explicit Cancel — the ONLY dismissal alongside full text deletion.
              Clears the found card (and any active ring) and returns to the
              idle search box. */}
          <button
            type="button"
            onClick={chooseAnother}
            className="mt-2 w-full px-5 py-3 rounded-2xl bg-white/5 hover:bg-red-500/20 border border-red-500/20 text-red-300 text-xs font-black kurdish-text transition-all"
          >
            پاشگەزبوونەوە
          </button>
        </div>
      )}
    </div>
  );

  const renderConnectStep = () => {
    if (!activeConn) return null;
    const isRequester = activeConn.requesterUid === myUid;
    return (
      <div dir="rtl">
        <div className="rounded-3xl border border-amber-400/25 bg-amber-400/5 p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="text-base font-black text-white kurdish-text">
              {isRequester ? "چاوەڕوانی وەرگرتن" : "بانگهێشتی تۆ"}
            </h3>
            <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
          </div>

          {renderPeerBadge(activeConn)}

          <p className="mt-4 text-[12px] text-gray-400 kurdish-text leading-relaxed">
            {isRequester
              ? `کاتێک ${activePeer.name} بانگهێشتەکە قبووڵ بکات، گفتوگۆکە بە شێوەیەکی ئۆتۆماتیکی دەکرێتەوە.`
              : `قبووڵی بکە بۆ دەستپێکردنی گفتوگۆی تایبەت لەگەڵ ${activePeer.name}.`}
          </p>

          {searchError && (
            <p className="mt-3 flex items-center gap-2 text-[11px] font-bold text-amber-400 kurdish-text">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {searchError}
            </p>
          )}

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {isRequester ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setActiveId(null);
                    setSearchError(null);
                  }}
                  disabled={nextBusy}
                  className="px-5 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-xs font-black kurdish-text transition-all disabled:opacity-50"
                >
                  گەڕانەوە
                </button>
                <button
                  type="button"
                  onClick={() => void handleCancel()}
                  disabled={nextBusy}
                  className="px-5 py-3 rounded-2xl bg-white/5 hover:bg-red-500/20 border border-red-500/20 text-red-300 text-xs font-black kurdish-text transition-all disabled:opacity-50"
                >
                  {nextBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  ڕاگرتنی بانگهێشت
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handleAccept(activeConn)}
                  disabled={nextBusy}
                  className="px-5 py-3 rounded-2xl bg-emerald-500/90 hover:bg-emerald-500 text-white text-xs font-black kurdish-text flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {nextBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  قبووڵکردن
                </button>
                <button
                  type="button"
                  onClick={() => handleReject(activeConn)}
                  disabled={nextBusy}
                  className="px-5 py-3 rounded-2xl bg-white/5 hover:bg-red-500/20 border border-red-500/20 text-red-300 text-xs font-black kurdish-text transition-all disabled:opacity-50"
                >
                  ڕەتکردنەوە
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ---- watch-together movie sync -------------------------------------------

  const filteredMovies = useMemo(() => {
    const q = movieQuery.trim().toLowerCase();
    const list = (movieCatalog || []).filter(
      (m: any) => !!m && typeof m === "object" && !!resolveMovieSourceUrl(m),
    );
    if (!q) return list;
    return list.filter((m: any) => String(m?.title || "").toLowerCase().includes(q));
  }, [movieCatalog, movieQuery]);

  const emitMovieSync = (patch: {
    movie?: SyncedMovie | null;
    playing: boolean;
    time: number;
  }) => {
    movieSeqRef.current += 1;
    const payload: MovieSyncPayload = {
      movie: patch.movie !== undefined ? patch.movie : roomMovie,
      playing: patch.playing,
      time: patch.time,
      seq: movieSeqRef.current,
      updatedAt: Date.now(),
    };
    setMovieTime(patch.time);
    clientRef.current?.sendMovie(payload);
  };

  const selectMovie = (m: any) => {
    const url = resolveMovieSourceUrl(m);
    if (!url) return;
    const synced: SyncedMovie = {
      id: String(m.id || url),
      title: m.title || "بێ ناونیشان",
      image: m.image || undefined,
      url,
    };
    setRoomMovie(synced);
    setMoviePickerOpen(false);
    pendingSeekRef.current = 0;
    setMoviePlaying(true);
    emitMovieSync({ movie: synced, playing: true, time: 0 });
  };

  const handleTogglePlay = () => {
    if (!roomMovie) return;
    const v = movieVideoRef.current;
    const next = !moviePlaying;
    setMoviePlaying(next);
    emitMovieSync({ movie: undefined, playing: next, time: v?.currentTime || 0 });
  };

  const handleSeek = (time: number) => {
    const v = movieVideoRef.current;
    if (!v || !roomMovie) return;
    const max = v.duration && isFinite(v.duration) ? v.duration : 0;
    const next = Math.max(0, max ? Math.min(time, max) : time);
    v.currentTime = next;
    setMovieTime(next);
    emitMovieSync({ movie: undefined, playing: moviePlaying, time: next });
  };

  const handleSeekBy = (delta: number) => {
    const v = movieVideoRef.current;
    if (!v || !roomMovie) return;
    handleSeek(v.currentTime + delta);
  };

  // Fetch the shared movie catalog once (shared by the picker AND the prefetch
  // below) so the Step-4 picker is instant the first time either peer taps it.
  const ensureMovieCatalog = useCallback(() => {
    if (movieCatFetchedRef.current || movieCatLoading) return;
    setMovieCatLoading(true);
    getDocs(collection(db, "movies"))
      .then((snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((m: any) => !!resolveMovieSourceUrl(m));
        setMovieCatalog(list);
        movieCatFetchedRef.current = true;
      })
      .catch(() => setMovieCatalog([]))
      .finally(() => setMovieCatLoading(false));
  }, [movieCatLoading]);

  // Step-4 readiness: prefetch the movie catalog the moment the CHAT step opens
  // so "فیلمێک هەڵبژێرە" is instant on first tap for BOTH peers — and whichever
  // side picks first syncs the player to the other via the private-chat socket.
  useEffect(() => {
    if (!open || !inChat) return;
    ensureMovieCatalog();
  }, [open, inChat, ensureMovieCatalog]);

  const openMoviePicker = () => {
    setMoviePickerOpen((o) => !o);
    ensureMovieCatalog();
  };

  // Peer relay: apply their movie selection / play / pause / seek. Sequence
  // numbers guard against out-of-order arrival; the playhead only snaps when a
  // meaningful gap exists so pulses never fight a local in-progress seek.
  const handleRemoteMovie = (payload: MovieSyncPayload) => {
    if (!payload || !payload.movie) return;
    if (typeof payload.seq === "number" && payload.seq <= lastRemoteSeqRef.current) return;
    lastRemoteSeqRef.current = payload.seq ?? lastRemoteSeqRef.current;
    const v = movieVideoRef.current;
    const target = Number(payload.time) || 0;
    if (!roomMovie || roomMovie.id !== payload.movie.id || roomMovie.url !== payload.movie.url) {
      pendingSeekRef.current = target;
      setRoomMovie(payload.movie);
      setMoviePlaying(payload.playing);
      if (v) v.currentTime = Math.max(0, target);
      return;
    }
    setMoviePlaying(payload.playing);
    if (v && (!v.duration || !isFinite(v.duration) || Math.abs(v.currentTime - target) > 4)) {
      v.currentTime = Math.max(0, Math.min(target, v.duration || target));
    }
  };
  // Latest-version handler so the socket onEvent closure never goes stale.
  const handleRemoteMovieRef = useRef<(p: MovieSyncPayload) => void>(() => {});
  handleRemoteMovieRef.current = handleRemoteMovie;

  // Drive the <video> element from the synced playback state. Autoplay may be
  // blocked without a user gesture — then the peer keeps playing and the user
  // just taps Play locally.
  useEffect(() => {
    const v = movieVideoRef.current;
    if (!v || !roomMovie) return;
    if (moviePlaying) {
      void v.play().catch(() => setMoviePlaying(false));
    } else {
      v.pause();
    }
  }, [moviePlaying, roomMovie?.url]);

  // Mirror the playhead into UI state and, while playing, push a periodic
  // position pulse to the peer so both sides stay converged without spamming
  // the socket on every timeupdate.
  useEffect(() => {
    let tick = 0;
    const iv = window.setInterval(() => {
      const v = movieVideoRef.current;
      if (!v) return;
      setMovieTime((prev) => (Math.abs(prev - v.currentTime) > 0.5 ? v.currentTime : prev));
      tick += 1;
      if (tick % 16 === 0 && roomMovie && moviePlaying) {
        emitMovieSync({ movie: undefined, playing: true, time: v.currentTime });
      }
    }, 500);
    return () => window.clearInterval(iv);
  }, [roomMovie, moviePlaying]);

  const renderChatStep = () => {
    if (!activeConn) return null;
    return (
      <div dir="rtl" className="flex flex-col h-full">
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-white text-sm font-black overflow-hidden flex-shrink-0">
              {activePeer.avatar ? (
                <img src={activePeer.avatar} alt={activePeer.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                (activePeer.name || "?").slice(0, 1).toUpperCase()
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black text-white kurdish-text truncate">{activePeer.name}</p>
              <p className="text-[10px] flex items-center gap-1.5">
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full ${
                    peerOnline ? "bg-emerald-400" : "bg-gray-500"
                  }`}
                />
                <span className={`font-mono ${peerOnline ? "text-emerald-300" : "text-gray-500"}`}>
                  {peerOnline ? "سەرهێڵ" : "دەرهێڵ"}
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              disabled
              title="پەیوەندی دەنگی بەم زووانە چالاک دەکرێت"
              className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-500 text-[11px] font-black kurdish-text flex items-center gap-1.5 cursor-not-allowed"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              پەیوەندی دەنگی
            </button>
            <button
              type="button"
              onClick={handleLeave}
              className="px-3 py-2 rounded-xl bg-white/5 hover:bg-red-500/20 border border-red-500/20 text-red-300 text-[11px] font-black kurdish-text flex items-center gap-1.5 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              بەجێهێشتن
            </button>
          </div>
        </div>

        {/* Watch together — synced movie player for both participants */}
        <div className="pt-3">
          <div className="rounded-2xl bg-black/40 border border-white/10 overflow-hidden">
            {roomMovie ? (
              <>
                <div className="relative aspect-video bg-black/70">
                  <video
                    key={`${roomMovie.id}__${roomMovie.url}`}
                    ref={movieVideoRef}
                    src={roomMovie.url}
                    poster={roomMovie.image}
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-contain"
                    onLoadedMetadata={(e) => {
                      const d = e.currentTarget.duration;
                      if (d && isFinite(d)) setMovieDuration(d);
                      const t = pendingSeekRef.current;
                      if (t != null) {
                        e.currentTarget.currentTime = Math.max(0, Math.min(t, d || t));
                        pendingSeekRef.current = null;
                      }
                    }}
                    onDurationChange={(e) => {
                      const d = e.currentTarget.duration;
                      if (d && isFinite(d)) setMovieDuration(d);
                    }}
                  />
                  {!moviePlaying && (
                    <button
                      type="button"
                      onClick={handleTogglePlay}
                      title="کردنەوە"
                      className="absolute inset-0 m-auto w-14 h-14 rounded-full bg-brand-primary hover:bg-red-700 text-white flex items-center justify-center transition-all"
                    >
                      <Play className="w-6 h-6 ml-0.5" />
                    </button>
                  )}
                </div>
                <div className="px-3 pt-2.5 flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-black text-white kurdish-text truncate">
                      {roomMovie.title}
                    </p>
                    <p className="text-[9px] font-mono text-gray-500 mt-0.5 flex items-center gap-1.5">
                      <span>{formatPlayTime(movieTime)}</span>
                      {moviePlaying && (
                        <span className="inline-flex items-center gap-1 text-emerald-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          پێکەوە دەبینین
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => handleSeekBy(-10)}
                      title="-10 چرکە"
                      className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 flex items-center justify-center transition-all"
                    >
                      <ChevronsRight className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleTogglePlay}
                      title={moviePlaying ? "ڕاگرتن" : "کردنەوە"}
                      className="w-11 h-11 rounded-xl bg-brand-primary hover:bg-red-700 text-white flex items-center justify-center transition-all"
                    >
                      {moviePlaying ? (
                        <Pause className="w-5 h-5" />
                      ) : (
                        <Play className="w-5 h-5 ml-0.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSeekBy(10)}
                      title="+10 چرکە"
                      className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 flex items-center justify-center transition-all"
                    >
                      <ChevronsLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={openMoviePicker}
                      title="فیلمێکی تر"
                      className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 flex items-center justify-center transition-all"
                    >
                      <Film className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={movieDuration || 1}
                  step={1}
                  value={Math.min(movieTime, movieDuration || 1)}
                  onChange={(e) => handleSeek(Number(e.target.value))}
                  className="w-full mt-0.5 mb-2 accent-brand-primary cursor-pointer"
                />
              </>
            ) : (
              <div className="p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-brand-primary/15 border border-brand-primary/30 flex items-center justify-center flex-shrink-0">
                    <Film className="w-4 h-4 text-brand-primary" />
                  </div>
                  <p className="text-[11px] text-gray-300 kurdish-text leading-snug">
                    واچ تۆگەدەر — فیلمێک هەڵبژێرە و بەیەکەوە سەیری بکەن
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openMoviePicker}
                  className="flex-shrink-0 px-3 py-2 rounded-xl bg-brand-primary hover:bg-red-700 text-white text-[11px] font-black kurdish-text flex items-center gap-1.5 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  فیلمێک هەڵبژێرە
                </button>
              </div>
            )}

            {moviePickerOpen && (
              <div className="border-t border-white/10 bg-zinc-950/70">
                <div className="p-2.5 flex items-center gap-2">
                  <Search className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                  <input
                    value={movieQuery}
                    onChange={(e) => setMovieQuery(e.target.value)}
                    placeholder="گەڕان بۆ فیلم..."
                    className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-black/40 border border-white/10 focus:border-brand-primary/60 outline-none text-xs text-white placeholder:text-gray-600"
                  />
                </div>
                <div className="px-2.5 pb-2.5 max-h-44 overflow-y-auto custom-scrollbar">
                  {movieCatLoading ? (
                    <div className="flex items-center justify-center gap-2 py-6">
                      <Loader2 className="w-4 h-4 animate-spin text-brand-primary" />
                      <span className="text-[10px] text-gray-500 kurdish-text">
                        فیلمەکان بار دەکرێن...
                      </span>
                    </div>
                  ) : filteredMovies.length === 0 ? (
                    <p className="text-center text-[11px] text-gray-500 kurdish-text py-6">
                      هیچ فیلمێک نەدۆزرایەوە
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {filteredMovies.map((m: any, idx: number) => (
                        <button key={m?.id ?? `movie_${idx}`} type="button" onClick={() => selectMovie(m)} className="text-right group">
                          <div className="aspect-video rounded-lg overflow-hidden border border-white/10 bg-white/5 group-hover:border-brand-primary/60 transition-all">
                            {m?.image ? (
                              <img
                                src={m.image}
                                alt={m?.title || "فیلم"}
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-white/5">
                                <Film className="w-4 h-4 text-white/20" />
                              </div>
                            )}
                          </div>
                          <p className="text-[9px] font-bold text-gray-400 group-hover:text-white truncate mt-1 kurdish-text">
                            {m?.title || "بێ ناونیشان"}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-4 space-y-2 min-h-0 custom-scrollbar">
          {messages.length === 0 && !chatConnecting && !sessionEnded && (
            <div className="text-center py-8">
              <MessageCircle className="w-8 h-8 text-white/10 mx-auto mb-3" />
              <p className="text-[11px] text-gray-500 kurdish-text">
                هیچ پەیامێک نییە — پەیامێک بنێرە بۆ دەستپێکردنی گفتوگۆ.
              </p>
            </div>
          )}
          {chatConnecting && (
            <div className="flex items-center justify-center gap-2 py-6">
              <Loader2 className="w-4 h-4 animate-spin text-brand-primary" />
              <span className="text-[11px] text-gray-500 kurdish-text">پەیوەندی بە دانیشتنەکە دەکرێت...</span>
            </div>
          )}
          {sessionEnded && (
            <div className="text-center py-6">
              <p className="text-[11px] font-bold text-gray-400 kurdish-text">
                دانیشتنەکە کۆتایی هات. بۆ گفتوگۆی نوێ، دووبارە چاتەکە بکەرەوە.
              </p>
            </div>
          )}
          {chatError && (
            <div className="flex items-center justify-center gap-2 py-3 text-[11px] font-bold text-amber-400 kurdish-text">
              <AlertCircle className="w-4 h-4" />
              {chatError}
            </div>
          )}
          {messages.map((msg) => (
            <div
              key={msg.clientId}
              className={`flex ${msg.mine ? "justify-start flex-row-reverse" : "justify-start"}`}
            >
              <div
                className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed break-words ${
                  msg.mine
                    ? "bg-brand-primary/90 text-white rounded-tr-sm"
                    : "bg-white/10 text-gray-100 rounded-tl-sm"
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
          {peerTyping && (
            <div className="flex justify-start">
              <div className="px-4 py-2.5 rounded-2xl bg-white/10 text-gray-300 text-[11px] kurdish-text">
                {activePeer.name} دەنووسێت...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="pt-3 border-t border-white/10 flex items-center gap-2">
          <input
            value={newMessage}
            onChange={(e) => {
              setNewMessage(e.target.value);
              handleTyping(e.target.value.trim().length > 0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="پەیامێک بنووسە..."
            disabled={sessionEnded}
            className="flex-1 min-w-0 px-4 py-3 rounded-2xl bg-black/40 border border-white/10 focus:border-brand-primary/60 outline-none text-sm text-white placeholder:text-gray-600 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!newMessage.trim() || sessionEnded || chatConnecting}
            className="px-5 py-3 rounded-2xl bg-brand-primary hover:bg-red-700 text-white text-xs font-black kurdish-text flex items-center justify-center gap-2 transition-all disabled:opacity-50 flex-shrink-0"
          >
            <Send className="w-4 h-4" />
            ناردن
          </button>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    // Readiness/PROFILE GATE BYPASSED: "OPEN WATCH TOGETHER" must open Step 1
    // (friend search) directly — for guests, while auth is still resolving, and
    // even when profile fields are missing. Safe metadata fallbacks above keep
    // every path null-safe; the old checking/guest/incomplete/error gate no
    // longer intercepts (it was what forced profile setup or surfaced the room
    // crash fallback instead of the search step).
    if (activeConn && activeConn.status === "accepted") return renderChatStep();
    if (activeConn?.status === "pending") return renderConnectStep();
    return renderFriendStep();
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-3 md:p-6">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="CinemaChat — گفتوگۆی تایبەت"
        className="relative w-full max-w-xl rounded-[2rem] border border-white/10 bg-zinc-900 shadow-2xl shadow-black/60 flex flex-col max-h-[92dvh] overflow-hidden"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10 bg-black/30 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-brand-primary/15 border border-brand-primary/30 flex items-center justify-center flex-shrink-0">
              <MessageCircle className="w-5 h-5 text-brand-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-black text-white kurdish-text">CinemaChat</h2>
              <p className="text-[10px] text-gray-500 kurdish-text">
                گفتوگۆی تایبەتی 1-بۆ-1 — هاوڕێ → بەرەو → قسەکردن
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="داخستن"
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 transition-all flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar min-h-0">{renderContent()}</div>

        {/* Step indicator — 1 FRIEND → 2 CONNECT → 3 CHAT → 4 MOVIE */}
        <div className="px-5 py-3 bg-black/30 border-t border-white/10 flex-shrink-0">
          <div className="grid grid-cols-4 gap-2">
            {[
              { n: 1, label: "Friend" },
              { n: 2, label: "Connect" },
              { n: 3, label: "Chat" },
              { n: 4, label: "Movie" },
            ].map((step) => {
              // Readiness gate bypassed: the indicator always reflects the
              // live step, starting at Step 1 (friend search) on open — even
              // for guests / incomplete profiles.
              const stepNum = inChat && roomMovie ? 4 : inChat ? 3 : activeConn ? 2 : 1;
              const active = step.n === stepNum;
              const done = step.n < stepNum;
              return (
                <div
                  key={step.n}
                  className={`h-9 rounded-xl border flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                    active
                      ? "bg-brand-primary text-white border-brand-primary"
                      : done
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
                        : "bg-white/5 text-gray-500 border-white/10"
                  }`}
                >
                  <span className="w-5 h-5 rounded-full bg-black/25 flex items-center justify-center">
                    {done ? <CheckCircle2 className="w-3 h-3" /> : step.n}
                  </span>
                  <span className="hidden sm:inline">{step.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default FriendConnectRoom;