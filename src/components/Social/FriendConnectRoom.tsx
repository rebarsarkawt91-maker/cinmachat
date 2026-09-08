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
  BellRing,
  Maximize2,
} from "lucide-react";
import {
  createFriendConnection,
  respondToFriendConnection,
  cancelFriendConnection,
  getFriendConnectionBetween,
  searchAccountByCCIdOrContact,
  subscribeConnectionsForUser,
  subscribeWatchCall,
  subscribeWatchCalls,
  sendWatchCallInvitation,
  cancelWatchCall,
  respondToWatchCall,
  endWatchSession,
  fetchActiveWatchSession,
  describeWatchCallError,
  friendPairKey,
  maskInvitePhone,
  WATCH_CALL_TTL_MS,
  isAnswerableWatchCallStatus,
} from "../../services/friendConnect";
import {
  ensureCallSignaling,
  onCallEvent,
} from "../../services/callSignaling";
import type {
  ContactSearchResult,
  FriendConnection,
  WatchCall,
} from "../../services/friendConnect";
import { censorOutgoingMessage } from "../../services/bannedWords";
import { PrivateChatClient, fetchPrivateSessionId } from "../../services/privateChatClient";
import type { PrivateChatMessage, MovieSyncPayload } from "../../services/privateChatClient";
import { resolveMovieSourceUrl } from "../../services/cinemaChat";
import type { AccountReadiness } from "../../services/accountReadiness";
import { getYTId, loadYouTubeAPI } from "../../utils/youtube";
import ImmersiveShieldedPlayer from "../Player/ImmersiveShieldedPlayer";
import { db, doc, onSnapshot, updateDoc } from "../../lib/firebase";

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
  /** Opens the saved-friends directory immediately from the floating button. */
  openFriendsInitially?: boolean;
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

const MOVIE_MESSAGE_PREFIX = "__cinemachat_movie__:";

// Posters are display-only. Some catalog records contain a whole base64 image,
// which must not be sent in a bounded real-time playback command.
const syncableMovieImage = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const image = value.trim();
  if (!image || image.startsWith("data:") || image.length > 2048) return undefined;
  return image;
};

const movieFromMessage = (text: string): SyncedMovie | null => {
  if (!text.startsWith(MOVIE_MESSAGE_PREFIX)) return null;
  try {
    const movie = JSON.parse(text.slice(MOVIE_MESSAGE_PREFIX.length));
    if (!movie?.id || !movie?.title || !movie?.url) return null;
    return movie as SyncedMovie;
  } catch {
    return null;
  }
};

export const FriendConnectRoom: React.FC<FriendConnectRoomProps> = (props) => {
  const {
    open,
    openFriendsInitially = false,
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
  const roomMovieRef = useRef<SyncedMovie | null>(null);
  roomMovieRef.current = roomMovie;
  const movieYoutubeRef = useRef<any>(null);
  const movieEmbedRef = useRef<HTMLIFrameElement | null>(null);
  const [moviePlaying, setMoviePlaying] = useState(false);
  const moviePlayingRef = useRef(false);
  moviePlayingRef.current = moviePlaying;
  const [movieTime, setMovieTime] = useState(0);
  const movieTimeRef = useRef(0);
  movieTimeRef.current = movieTime;
  const [movieDuration, setMovieDuration] = useState(0);
  const [moviePickerOpen, setMoviePickerOpen] = useState(false);
  const [movieQuery, setMovieQuery] = useState("");
  const [movieCatalog, setMovieCatalog] = useState<any[] | null>(null);
  const [movieCatLoading, setMovieCatLoading] = useState(false);
  const movieVideoRef = useRef<HTMLVideoElement | null>(null);
  const movieFrameRef = useRef<HTMLDivElement | null>(null);
  const movieSeqRef = useRef(0);
  const pendingMovieSyncRef = useRef<MovieSyncPayload | null>(null);
  // A missed play/pause/seek action that is held until the server's authoritative
  // movieState replay arrives on the reconnected socket (so a stale local
  // snapshot can never resurrect an old movie on the peer).
  const resyncAfterJoinedRef = useRef<MovieSyncPayload | null>(null);
  const remotePlaybackRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  // Player readiness gate for the current source. Play/seek commands must wait
  // until the actual player is mounted and the source can be decoded — driving
  // a bare element (or a YouTube/embed that is still booting) is exactly what
  // produced a permanent black frame on the receiving side.
  const [moviePlayerState, setMoviePlayerState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const moviePlayerStateRef = useRef<"idle" | "loading" | "ready" | "error">("idle");
  moviePlayerStateRef.current = moviePlayerState;
  const movieCatFetchedRef = useRef(false);

  // "Call Invitation" (watch-together ring) state for the found peer. The ring
  // signal lives in the invitations collection (kind: "watchcall"); we keep the
  // caller's own doc id + live status here so the card can show Ringing → done.
  const [activeCall, setActiveCall] = useState<WatchCall | null>(null);
  const [callBusy, setCallBusy] = useState(false);
  // Authoritative caller-side state machine completion: a ring nobody answered
  // within WATCH_CALL_TTL_MS is cancelled (idempotent server write) and the
  // card drops back to a usable state with an explicit "expired" message —
  // the outgoing call can never hang in "pending" forever. The flag is bound
  // to the EXPIRED call's id, so any later (new) call id never shows it.
  const [expiredCallId, setExpiredCallId] = useState<string | null>(null);

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
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [friendPresence, setFriendPresence] = useState<Record<string, boolean>>({});
  const [presenceVisible, setPresenceVisible] = useState(true);
  const [presenceBusy, setPresenceBusy] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  useEffect(() => {
    if (open && openFriendsInitially) setFriendsOpen(true);
  }, [open, openFriendsInitially]);
  const manualReturnToSearchRef = useRef(false);

  // SERVER-AUTHORITATIVE session (watch-call store): a FriendConnection built
  // from the server's accepted push/REST response. Under a Firestore outage
  // (429) the `connections` snapshot never arrives — THIS is what lets both
  // peers open the shared chat anyway, with the exact server identity.
  const [storeConn, setStoreConn] = useState<FriendConnection | null>(null);

  // In-modal incoming "Call Invitation" rings (mirror of the global banner):
  // the room shows its own prominent Accept/Reject card on Step 1 / Step 2 so a
  // user already inside the modal can answer without relying on the banner.
  const [incomingCalls, setIncomingCalls] = useState<WatchCall[]>([]);
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  // Internal queue for an in-modal accept — feeds the SAME deterministic join
  // mechanism as the banner path (no dependency on App-level props).
  const [localJoinCallId, setLocalJoinCallId] = useState<string | null>(null);
  const [localJoinConnId, setLocalJoinConnId] = useState<string | null>(null);

  // Effective deterministic-join identity: banner accept (App props) OR in-modal
  // accept (local). Both route the receiver straight into Step 3 (CHAT) and
  // Step 4 (MOVIE) — never a guessed "latest accepted" pair.
  const joinCallId = autoConnectCallIdProp ?? localJoinCallId ?? null;
  const joinConnId =
    autoConnectConnectionIdProp ?? localJoinConnId ?? activeRoomIdProp ?? null;

  // Chat state (ephemeral — in-memory only).
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [peerOnline, setPeerOnline] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const [chatConnecting, setChatConnecting] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [voiceState, setVoiceState] = useState<"idle" | "connecting" | "connected" | "error">("idle");

  const clientRef = useRef<PrivateChatClient | null>(null);
  const voicePeerRef = useRef<RTCPeerConnection | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingVoiceIceRef = useRef<RTCIceCandidateInit[]>([]);
  const handleVoiceSignalRef = useRef<(payload: { kind: "offer" | "answer" | "ice"; data: any }) => Promise<void>>(async () => {});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ---- derived state -------------------------------------------------------
  // Firestore snapshot first (works normally); the server-store connection
  // takes over when Firestore is unavailable (quota-dead) — the ids agree.
  const activeConn = useMemo(
    () =>
      connections.find((c) => c.id === activeId) ??
      (storeConn && storeConn.id === activeId ? storeConn : null),
    [connections, activeId, storeConn],
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
    (conn: FriendConnection | null): { uid: string; name: string; code: string; avatar?: string } => {
      if (!conn) return { uid: "", name: "", code: "" };
      const peerIsRequester = conn.requesterUid === myUid;
      return {
        uid: peerIsRequester ? conn.targetUid : conn.requesterUid,
        name: peerIsRequester ? conn.targetName : conn.requesterName,
        code: peerIsRequester ? conn.targetCode : conn.requesterCode,
        avatar: peerIsRequester ? conn.targetAvatar || undefined : conn.requesterAvatar || undefined,
      };
    },
    [myUid],
  );
  const activePeer = peerOf(activeConn);

  const ensureVoicePeer = useCallback(async () => {
    if (voicePeerRef.current) return voicePeerRef.current;
    const stream = voiceStreamRef.current || await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    voiceStreamRef.current = stream;
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    peer.onicecandidate = (event) => {
      if (event.candidate) clientRef.current?.sendVoiceSignal({ kind: "ice", data: event.candidate.toJSON() });
    };
    peer.ontrack = (event) => {
      const audio = voiceAudioRef.current;
      if (audio) {
        audio.srcObject = event.streams[0];
        void audio.play().catch(() => {});
      }
      setVoiceState("connected");
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") setVoiceState("connected");
      if (["failed", "disconnected", "closed"].includes(peer.connectionState)) setVoiceState("error");
    };
    voicePeerRef.current = peer;
    return peer;
  }, []);

  const startVoiceCall = useCallback(async () => {
    if (!clientRef.current || voiceState === "connecting" || voiceState === "connected") return;
    setVoiceState("connecting");
    try {
      const peer = await ensureVoicePeer();
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      clientRef.current.sendVoiceSignal({ kind: "offer", data: offer });
    } catch {
      setVoiceState("error");
    }
  }, [ensureVoicePeer, voiceState]);

  handleVoiceSignalRef.current = async (payload) => {
    try {
      const peer = await ensureVoicePeer();
      if (payload.kind === "offer") {
        await peer.setRemoteDescription(payload.data);
        for (const candidate of pendingVoiceIceRef.current.splice(0)) {
          await peer.addIceCandidate(candidate);
        }
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        clientRef.current?.sendVoiceSignal({ kind: "answer", data: answer });
      } else if (payload.kind === "answer") {
        await peer.setRemoteDescription(payload.data);
        for (const candidate of pendingVoiceIceRef.current.splice(0)) {
          await peer.addIceCandidate(candidate);
        }
      } else if (payload.kind === "ice" && payload.data) {
        // ICE can arrive before the offer/answer on fast local networks. Queue
        // it until a remote description exists instead of failing the call.
        if (!peer.remoteDescription) pendingVoiceIceRef.current.push(payload.data);
        else await peer.addIceCandidate(payload.data);
      }
      if (peer.connectionState !== "connected") setVoiceState("connecting");
    } catch {
      setVoiceState("error");
    }
  };

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

  // A friend list is built only from accepted relationships. Presence is a
  // display preference: hidden users look offline to friends while their real
  // authentication/session state remains untouched.
  const acceptedFriends = useMemo(
    () => connections.filter((connection) => connection.status === "accepted"),
    [connections],
  );

  useEffect(() => {
    if (!open || !myUid) return;
    const ownUnsub = onSnapshot(doc(db, "users", myUid), (snap) => {
      setPresenceVisible(snap.data()?.friendPresenceVisibility !== "offline");
    }, () => {});
    const peerUnsubs = acceptedFriends.map((connection) => {
      const peerUid = connection.requesterUid === myUid ? connection.targetUid : connection.requesterUid;
      return onSnapshot(doc(db, "users", peerUid), (snap) => {
        const data = snap.data();
        const online = !!data?.isOnline && data?.friendPresenceVisibility !== "offline";
        setFriendPresence((current) => ({ ...current, [peerUid]: online }));
      }, () => {});
    });
    return () => {
      ownUnsub();
      peerUnsubs.forEach((unsub) => unsub());
    };
  }, [open, myUid, acceptedFriends]);

  const setFriendPresenceVisibility = useCallback(async (visible: boolean) => {
    if (!myUid || presenceBusy) return;
    setPresenceBusy(true);
    try {
      await updateDoc(doc(db, "users", myUid), {
        friendPresenceVisibility: visible ? "online" : "offline",
      });
      setPresenceVisible(visible);
    } finally {
      setPresenceBusy(false);
    }
  }, [myUid, presenceBusy]);

  // Live incoming "Call Invitation" rings, so an in-modal Accept/Reject card can
  // answer a call WITHOUT the global banner. uid-only keys always match (the
  // sender stamps target.uid into toKeys). Ringing calls past the TTL are
  // dropped client-side so a stale doc never shows a ghost button.
  useEffect(() => {
    if (!open || !myUid) return;
    return subscribeWatchCalls(
      { uid: myUid, phone: null },
      (calls) =>
        setIncomingCalls(
          calls.filter(
            (c) => Date.now() - new Date(c.startedAt).getTime() < WATCH_CALL_TTL_MS,
          ),
        ),
      () => {},
    );
  }, [open, myUid]);

  // ── Server-authoritative call events (instant, Firestore-independent) ──
  // One subscription drives BOTH sides: the caller advances out of "Ringing"
  // and into the shared chat on `accepted`; the receiver lands in the same
  // room; reject/cancel/expiry clear every UI surface; `ended` drops a peer
  // who left. Refs keep the handler current without resubscribing.
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  const activeCallRef = useRef<WatchCall | null>(null);
  activeCallRef.current = activeCall;

  useEffect(() => {
    if (!open || !myUid) return;
    void ensureCallSignaling(myUid);

    /** Build the local accepted connection from the server's canonical call
     *  payload (works with NO Firestore snapshot available). */
    const connectionFromServerCall = (call: any): FriendConnection => {
      const iAmCaller = call.fromId === myUid;
      return {
        id: String(call.connectionId || call.callId),
        kind: "friend",
        participants: [call.fromId, call.toId].sort(),
        requesterUid: call.fromId,
        requesterName: call.fromName,
        requesterCode: call.fromCode,
        requesterAvatar: call.fromAvatar ?? null,
        targetUid: call.toId,
        targetName: call.toName,
        targetCode: call.toCode,
        targetAvatar: call.toAvatar ?? null,
        status: "accepted",
        createdAt: call.createdAt || new Date().toISOString(),
        acceptedAt: new Date().toISOString(),
      };
    };

    const enterSharedRoom = (call: any) => {
      const conn = connectionFromServerCall(call);
      manualReturnToSearchRef.current = false;
      setStoreConn(conn);
      setActiveId(conn.id);
      setFound(null);
      setFoundConn(null);
      setSearchStatus("idle");
      setSearchError(null);
      setJoinConsumed(true);
      setLocalJoinCallId(null);
      setLocalJoinConnId(null);
      setActiveCall(null);
      setExpiredCallId(null);
      setIncomingCalls((prev) => prev.filter((c) => c.id !== call.callId));
      onAutoConnectConsumedRef.current?.();
    };

    return onCallEvent((event) => {
      if (event.type === "watch_call:state_sync") {
        const sync: any = event;
        setIncomingCalls(
          (sync.incoming || []).filter(
            (c: any) => Date.now() - new Date(c.startedAt || c.createdAt).getTime() < WATCH_CALL_TTL_MS,
          ),
        );
        const active = sync.activeSession;
        if (
          active?.connection &&
          !activeIdRef.current &&
          !manualReturnToSearchRef.current
        ) {
          setStoreConn(connectionFromServerCall(active.call));
          setActiveId(active.connection.connectionId || active.connection.id);
          setJoinConsumed(true);
        }
        // An outgoing ring that vanished from the server's live list resolved
        // while we were disconnected — reflect its final state.
        const mine = (sync.outgoing || []).find(
          (c: any) => c.callId === activeCallRef.current?.id,
        );
        if (activeCallRef.current && !mine && isAnswerableWatchCallStatus(activeCallRef.current.status)) {
          setActiveCall((current) =>
            current ? { ...current, status: "ended" } : current,
          );
        }
        return;
      }

      const call: any = (event as any).call || {};

      if (event.type === "watch_call:accepted") {
        if (call.fromId !== myUid && call.toId !== myUid) return;
        enterSharedRoom(call);
        return;
      }

      if (event.type === "watch_call:declined") {
        setIncomingCalls((prev) => prev.filter((c) => c.id !== call.callId));
        if (call.fromId === myUid) {
          setActiveCall((current) =>
            current?.id === call.callId ? { ...current, status: "declined" } : current,
          );
        }
        return;
      }

      if (event.type === "watch_call:cancelled") {
        setIncomingCalls((prev) => prev.filter((c) => c.id !== call.callId));
        if (call.fromId === myUid) {
          setActiveCall((current) =>
            current?.id === call.callId ? { ...current, status: "ended" } : current,
          );
        }
        return;
      }

      if (event.type === "watch_call:expired") {
        setIncomingCalls((prev) => prev.filter((c) => c.id !== call.callId));
        if (call.fromId === myUid) {
          setActiveCall((current) =>
            current?.id === call.callId ? { ...current, status: "ended" } : current,
          );
          setExpiredCallId(call.callId);
        }
        return;
      }

      if (event.type === "watch_call:ended") {
        if (activeIdRef.current && call.connectionId === activeIdRef.current) {
          // The peer (or the server) ended the live session — leave cleanly.
          tearDownClient(false);
          setActiveId(null);
          setStoreConn(null);
        }
        return;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Ring expiry (CALLER side): when our ring is still answerable after the
  // TTL, cancel it and surface the timeout instead of ringing forever. The
  // timer is armed against the call's own startedAt so a remount mid-ring
  // keeps the original deadline; the server's authoritative sweep + push is
  // the primary expiry path — this local timer is the same deadline applied
  // optimistically for instant UI feedback.
  useEffect(() => {
    if (!activeCall || !isAnswerableWatchCallStatus(activeCall.status)) return;
    const elapsed = Date.now() - new Date(activeCall.startedAt).getTime();
    const remaining = Math.max(0, WATCH_CALL_TTL_MS - elapsed);
    const timer = window.setTimeout(() => {
      // Double-check inside the timer: the accept/decline may have landed
      // while we waited. Only a still-ringing call expires.
      setActiveCall((current) => {
        if (current?.id === activeCall.id && isAnswerableWatchCallStatus(current.status)) {
          void cancelWatchCall(current.id).catch(() => {});
          setExpiredCallId(current.id);
          return { ...current, status: "ended" };
        }
        return current;
      });
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [activeCall]);

  // A "Call Invitation" the peer accepted streams its invitation doc to
  // status === "accepted". THAT explicit answer is the only auto-advance off
  // the found friend card (a background accepted pair still never jumps the
  // card): the caller transitions straight into the shared private chat so both
  // sides land in the same room together. We wait for the accepted pair to show
  // up in the local snapshot so the chat step never renders without a peer.
  useEffect(() => {
    if (manualReturnToSearchRef.current || !open || activeId || !activeCall || activeCall.status !== "accepted") return;
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
  useEffect(() => {
    if (!open || !joinCallId) return;
    setJoinCall(null);
    const unsub = subscribeWatchCall(joinCallId, (call) => setJoinCall(call), () => {});
    return unsub;
  }, [open, joinCallId]);

  // Reset the consumed flag whenever a (new) call is queued, so a fresh accept
  // on a later ring joins again instead of being blocked by an old join.
  useEffect(() => {
    if (joinCallId) manualReturnToSearchRef.current = false;
    setJoinConsumed(false);
  }, [joinCallId]);

  useEffect(() => {
    if (manualReturnToSearchRef.current || !open || joinConsumed) return;
    const resolvedRoomId = joinConnId || activeRoomIdProp || null;
    if (!resolvedRoomId) return;
    if (!joinCall && !joinCallId) return;
    if (joinCall && joinCall.status !== "accepted") return;
    const conn = connections.find((c) => c.id === resolvedRoomId || c.id === joinCall?.connectionId);
    if (!conn || conn.status !== "accepted") return;
    setActiveId(conn.id);
    setSearchStatus("idle");
    setFound(null);
    setFoundConn(null);
    setJoinConsumed(true);
    setLocalJoinCallId(null);
    setLocalJoinConnId(null);
    onAutoConnectConsumedRef.current?.();
  }, [open, joinCallId, joinConnId, joinCall, connections, joinConsumed, activeRoomIdProp]);

  // Receiver-side root sync: if the app reopened the room with a known shared
  // room id before the Firestore listener settles, we still jump immediately to
  // the accepted private connection instead of waiting for a second click.
  useEffect(() => {
    if (manualReturnToSearchRef.current || !open || joinConsumed) return;
    const resolvedRoomId = joinConnId || activeRoomIdProp || null;
    if (!resolvedRoomId) return;
    const conn = connections.find((c) => c.id === resolvedRoomId);
    if (!conn || conn.status !== "accepted") return;
    setActiveId(resolvedRoomId);
    setSearchStatus("idle");
    setFound(null);
    setFoundConn(null);
    setJoinConsumed(true);
    setLocalJoinCallId(null);
    setLocalJoinConnId(null);
    onAutoConnectConsumedRef.current?.();
  }, [open, activeRoomIdProp, joinConnId, connections, joinConsumed]);

  // Session restore after a page refresh / remount (Problem 3, scenario 18).
  // The accepted connection id is kept in sessionStorage (tab-scoped, survives
  // refresh, dies with the tab). The pointer is only EVER honored after the
  // live Firestore snapshot confirms the pair is still "accepted" for this
  // account (participant-gated rules), so a stale/ended session can neither
  // restore nor leak anyone else's room.
  const watchSessionKey = myUid ? `cinemachat:watch-session:${myUid}` : null;
  const restoreConnIdRef = useRef<string | null>(null);
  const [restoreChecked, setRestoreChecked] = useState(false);

  const persistWatchSession = useCallback(
    (connectionId: string) => {
      if (!watchSessionKey) return;
      try {
        sessionStorage.setItem(
          watchSessionKey,
          JSON.stringify({ connectionId, at: Date.now() }),
        );
      } catch {
        /* storage unavailable (private mode) — live join still works */
      }
    },
    [watchSessionKey],
  );

  const clearWatchSession = useCallback(() => {
    if (!watchSessionKey) return;
    try {
      sessionStorage.removeItem(watchSessionKey);
    } catch {
      /* nothing to clear */
    }
  }, [watchSessionKey]);

  // Persist the accepted session id the first time a chat becomes active (both
  // call-accept and manual friend-accept paths land here).
  const persistedConnIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeConn?.status !== "accepted" || !activeConn.id) return;
    if (persistedConnIdRef.current === activeConn.id) return;
    persistedConnIdRef.current = activeConn.id;
    persistWatchSession(activeConn.id);
  }, [activeConn, persistWatchSession]);

  useEffect(() => {
    if (!open || restoreChecked) return;
    // Already inside a session, or a deterministic join owns this open.
    if (activeId || joinCallId) {
      setRestoreChecked(true);
      return;
    }
    try {
      const raw = watchSessionKey ? sessionStorage.getItem(watchSessionKey) : null;
      if (raw) {
        const saved = JSON.parse(raw) as { connectionId?: string };
        if (saved?.connectionId) restoreConnIdRef.current = saved.connectionId;
      }
    } catch {
      clearWatchSession();
    }
    setRestoreChecked(true);
  }, [open, restoreChecked, activeId, joinCallId, watchSessionKey, clearWatchSession]);

  useEffect(() => {
    if (!open || !restoreConnIdRef.current) return;
    if (manualReturnToSearchRef.current || activeId || joinCallId) return;
    const conn = connections.find((c) => c.id === restoreConnIdRef.current);
    if (!conn) return; // snapshot not settled yet
    if (conn.status !== "accepted") {
      // The saved session is no longer valid — drop the pointer quietly.
      clearWatchSession();
      restoreConnIdRef.current = null;
      return;
    }
    restoreConnIdRef.current = null;
    setActiveId(conn.id);
    setSearchStatus("idle");
    setFound(null);
    setFoundConn(null);
  }, [open, connections, activeId, joinCallId, clearWatchSession]);

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
    lastRemoteSeqBySenderRef.current = new Map();
    lastRemoteUpdatedAtBySenderRef.current = new Map();
    pendingSeekRef.current = null;
    setMoviePlayerState("idle");
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
      if (event.type === "joined") {
        // Do not enable chat/movie controls until the server has authenticated
        // this socket. Otherwise an early click is silently dropped.
        setChatConnecting(false);
        setSessionEnded(false);
        setPeerOnline(event.peerOnline === true);
        // A reconnected socket must not immediately re-emit its own (possibly
        // stale) snapshot — the server's authoritative movieState replay arrives
        // as a `movie` event right after `joined`. A missed ACTION is deferred
        // and flushed once that replay lands (see the `movie` branch below) so
        // it can never resurrect an old movie on the peer.
        const pendingAction = pendingMovieSyncRef.current;
        pendingMovieSyncRef.current = null;
        if (event.peerOnline === true && pendingAction) {
          resyncAfterJoinedRef.current = pendingAction;
        }
      } else if (event.type === "message") {
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
      } else if (event.type === "heartbeat_ack" && typeof event.peerOnline === "boolean") {
        setPeerOnline(event.peerOnline);
      } else if (event.type === "typing") {
        setPeerTyping(event.typing);
      } else if (event.type === "movie") {
        handleRemoteMovieRef.current(event.payload, event.uid);
        const resync = resyncAfterJoinedRef.current;
        if (resync) {
          resyncAfterJoinedRef.current = null;
          emitMovieSync({
            movie: event.payload.movie,
            playing: resync.playing,
            time: resync.time,
            seek: resync.seek,
          });
        }
      } else if (event.type === "movie_invite") {
        const text = `${MOVIE_MESSAGE_PREFIX}${JSON.stringify(event.payload)}`;
        if (event.ack) {
          setMessages((prev) => prev.map((m) =>
            m.clientId === event.clientId ? { ...m, confirmed: true } : m,
          ));
        } else {
          setMessages((prev) => prev.some((m) => m.clientId === event.clientId)
            ? prev
            : [...prev, { clientId: event.clientId, senderId: event.uid, text, ts: Date.now(), mine: false, confirmed: true }]);
        }
      } else if (event.type === "voice_signal") {
        void handleVoiceSignalRef.current(event.payload);
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
      voicePeerRef.current?.close();
      voicePeerRef.current = null;
      voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
      voiceStreamRef.current = null;
      pendingVoiceIceRef.current = [];
      if (voiceAudioRef.current) voiceAudioRef.current.srcObject = null;
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

  // Stale-state reset on close (Problem 5): any transient search/call state is
  // dropped so reopening always renders the CURRENT server state — no ghost
  // found card, no resurrected ring, no stale join queue. A VALID accepted
  // session (activeId) is intentionally PRESERVED: closing the modal must
  // never destroy the shared room the user is still in.
  useEffect(() => {
    if (open) return;
    setActiveCall(null);
    setExpiredCallId(null);
    setJoinCall(null);
    setLocalJoinCallId(null);
    setLocalJoinConnId(null);
    setJoinConsumed(false);
    setJoinError(null);
    setFound(null);
    setFoundConn(null);
    setInput("");
    setSearchStatus("idle");
    setSearchError(null);
    manualReturnToSearchRef.current = false;
    setRestoreChecked(false);
    restoreConnIdRef.current = null;
  }, [open]);

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
    if (isAnswerableWatchCallStatus(activeCall?.status)) void cancelWatchCall(activeCall.id).catch(() => {});
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
    if (isAnswerableWatchCallStatus(activeCall?.status)) void cancelWatchCall(activeCall.id).catch(() => {});
    setActiveCall(null);
    setFound(null);
    setFoundConn(null);
    setSearchStatus("idle");
    setSearchError(null);
    setInput("");
  }, [activeCall]);

  const handleNext = useCallback(async () => {
    if (!found || nextBusy) return;
    manualReturnToSearchRef.current = false;
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
      if (isAnswerableWatchCallStatus(activeCall?.status)) void cancelWatchCall(activeCall.id).catch(() => {});
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
    manualReturnToSearchRef.current = false;
    if (activeCall && isAnswerableWatchCallStatus(activeCall.status)) return;
    if (!requireAccount("بۆ ناردنی بانگهێشتی پەیوەندی پێویستە ئەکاونتێکی هەبێت")) return;
    setCallBusy(true);
    setSearchError(null);
    try {
      const { callId, connectionId, roomId: serverRoomId } = await sendWatchCallInvitation({
        requesterUid: myUid,
        requesterName: myName,
        requesterCode: myCode,
        requesterAvatar: myAvatar || null,
        target: found,
      });
      // Provisional "calling" state — the server pushes the REAL transition
      // (accepted/declined/expired) over the signaling socket right after.
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
        roomId: serverRoomId || connectionId,
        startedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      } as WatchCall);
    } catch (err) {
      // ONE safe category per failure class — never a fake "Ringing".
      setSearchError(describeWatchCallError(err));
    } finally {
      setCallBusy(false);
    }
  }, [found, callBusy, activeCall, myUid, myName, myCode, myAvatar, requireAccount]);

  const handleCancelCall = useCallback(async () => {
    if (!activeCall || !isAnswerableWatchCallStatus(activeCall.status)) return;
    setCallBusy(true);
    try {
      await cancelWatchCall(activeCall.id);
      setActiveCall((c) => (c ? { ...c, status: "ended" } : c));
    } catch (err) {
      setSearchError(describeWatchCallError(err));
    } finally {
      setCallBusy(false);
    }
  }, [activeCall, callBusy]);

  // In-modal "وەرگرتنی پەیوەندی" (Accept Call): flags the ring "accepted" in
  // Firestore (the caller's real-time doc listener advances HIM into the shared
  // room), then queues the SAME deterministic join the banner uses — the call +
  // its pair — so THIS room instantly routes to Step 3 (CHAT) / Step 4 (MOVIE)
  // the moment the Firestore snapshot reflects the accepted pair. No banner, no
  // second click, no stranded Step-1/Step-2 screen.
  const handleAcceptIncomingCall = useCallback(
    async (call: WatchCall) => {
      if (!call || joinBusy) return;
      manualReturnToSearchRef.current = false;
      setJoinBusy(true);
      setJoinError(null);
      try {
        const connId = call.connectionId || call.id;
        // SERVER-CONFIRMED accept: only after the store transition succeeds
        // does the room open — with the canonical ids from the response.
        const confirmed = await respondToWatchCall(call.id, connId, "accepted", {
          uid: myUid,
          name: myName,
          code: myCode,
          avatar: myAvatar,
        });
        const finalConnId = confirmed?.connectionId || connId;
        // Enter the shared room directly from the server's canonical answer
        // (the accepted socket push lands separately and is idempotent).
        setJoinConsumed(false);
        setLocalJoinCallId(call.id);
        setLocalJoinConnId(finalConnId);
        if (confirmed?.call) {
          setStoreConn({
            id: finalConnId,
            kind: "friend",
            participants: [confirmed.call.fromId, confirmed.call.toId].sort(),
            requesterUid: confirmed.call.fromId,
            requesterName: confirmed.call.fromName,
            requesterCode: confirmed.call.fromCode,
            requesterAvatar: confirmed.call.fromAvatar ?? null,
            targetUid: confirmed.call.toId,
            targetName: confirmed.call.toName,
            targetCode: confirmed.call.toCode,
            targetAvatar: confirmed.call.toAvatar ?? null,
            status: "accepted",
            createdAt: confirmed.call.createdAt || new Date().toISOString(),
            acceptedAt: new Date().toISOString(),
          });
          setActiveId(finalConnId);
          setFound(null);
          setFoundConn(null);
          setSearchStatus("idle");
          setJoinConsumed(true);
          setLocalJoinCallId(null);
          setLocalJoinConnId(null);
        } else {
          setFound(null);
          setFoundConn(null);
          setSearchStatus("idle");
        }
        setIncomingCalls((prev) => prev.filter((c) => c.id !== call.id));
      } catch (err) {
        setJoinError(describeWatchCallError(err));
      } finally {
        setJoinBusy(false);
      }
    },
    [joinBusy, myUid, myName, myCode, myAvatar],
  );

  const handleRejectIncomingCall = useCallback(
    async (call: WatchCall) => {
      if (!call || joinBusy) return;
      setJoinBusy(true);
      try {
        await respondToWatchCall(call.id, call.connectionId || call.id, "declined");
        setIncomingCalls((prev) => prev.filter((c) => c.id !== call.id));
      } catch {
        /* best-effort decline */
      } finally {
        setJoinBusy(false);
      }
    },
    [joinBusy],
  );

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
    // The server intentionally keeps no message history. Wait for the peer's
    // live socket so a message cannot be accepted locally and then disappear.
    if (!raw || !clientRef.current || !peerOnline) return;
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
  }, [newMessage, myUid, peerOnline]);

  const sendMovieMessage = useCallback((movie: SyncedMovie) => {
    if (!clientRef.current || !peerOnline) return;
    const text = `${MOVIE_MESSAGE_PREFIX}${JSON.stringify(movie)}`;
    const clientId = generateClientId();
    setMessages((prev) => [
      ...prev,
      { clientId, senderId: myUid, text, ts: Date.now(), mine: true, confirmed: false },
    ]);
    if (!clientRef.current.sendMovieInvite(movie, clientId)) {
      setMessages((prev) => prev.filter((message) => message.clientId !== clientId));
    }
  }, [myUid, peerOnline]);

  const handleTyping = useCallback(
    (typing: boolean) => {
      clientRef.current?.sendTyping(typing);
    },
    [],
  );

  const handleLeave = useCallback(() => {
    // Tell the server store the session ended BEFORE tearing down locally —
    // the peer's socket push drops them out of the chat consistently, and the
    // call can never be "restored" by a later refresh.
    if (activeConn?.id) void endWatchSession(activeConn.id);
    tearDownClient(true);
    setActiveId(null);
    setStoreConn(null);
    clearWatchSession();
  }, [tearDownClient, clearWatchSession, activeConn]);

  const returnToFriendSearch = useCallback(() => {
    // Leaving an ephemeral 1-to-1 session must release both sockets before a
    // new peer is selected; the accepted friendship record itself is retained.
    manualReturnToSearchRef.current = true;
    tearDownClient(true);
    setActiveId(null);
    setActiveCall(null);
    setExpiredCallId(null);
    setFound(null);
    setFoundConn(null);
    setSearchStatus("idle");
    setSearchError(null);
    setInput("");
    setRoomMovie(null);
    setMoviePickerOpen(false);
    clearWatchSession();
  }, [tearDownClient, clearWatchSession]);

  // Back action for the lower step navigation (Problem 5): one visible control
  // that always lands on the previous valid stage — CONNECT → FRIEND goes back
  // a step, CHAT/MOVIE → FRIEND leaves the live session first (the accepted
  // friendship record itself is kept, so the pair can always re-open chat).
  const handleStepBack = useCallback(() => {
    if (roomMovie) {
      setMoviePlaying(false);
      setRoomMovie(null);
      return;
    }
    if (inChat) {
      returnToFriendSearch();
      return;
    }
    if (activeConn?.status === "pending") {
      setActiveId(null);
      setSearchError(null);
    }
  }, [roomMovie, inChat, activeConn, returnToFriendSearch]);

  const maskedContact = useMemo(() => {
    if (!found) return "";
    return maskInvitePhone(found.phone || found.email);
  }, [found]);

  // ---- render --------------------------------------------------------------
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

  const renderIncomingCallCard = () => {
    const call = incomingCalls[0];
    if (!call) return null;
    return (
      <div dir="rtl" className="mb-5">
        <div className="rounded-3xl border border-amber-400/40 bg-amber-400/10 p-4 relative overflow-hidden">
          <div className="absolute -right-8 -top-8 w-28 h-28 rounded-full bg-amber-400/10" />
          <div className="relative flex items-center gap-3 min-w-0">
            <div className="relative w-12 h-12 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center flex-shrink-0">
              <BellRing className="w-5 h-5 text-amber-400" />
              <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400" />
              </span>
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-black text-white kurdish-text">
                بانگهێشتی پەیوەندی
              </h4>
              <p className="text-[11px] text-gray-300 kurdish-text mt-0.5 leading-snug">
                {call.fromName} دەوێت بەیەکەوە فیلم ببینن — وەرگرتنی پەیوەندی
              </p>
            </div>
          </div>
          {joinError && (
            <p className="relative mt-2 flex items-center gap-1.5 text-[10px] font-bold text-red-400 kurdish-text">
              <AlertCircle className="w-3 h-3 shrink-0" />
              {joinError}
            </p>
          )}
          <div className="relative mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              disabled={joinBusy}
              onClick={() => void handleAcceptIncomingCall(call)}
              className="px-4 py-2.5 rounded-2xl bg-emerald-500/90 hover:bg-emerald-500 text-white text-xs font-black kurdish-text flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              {joinBusy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <PhoneCall className="w-4 h-4" />
              )}
              وەرگرتنی پەیوەندی • {call.fromName}
            </button>
            <button
              type="button"
              disabled={joinBusy}
              onClick={() => void handleRejectIncomingCall(call)}
              className="px-4 py-2.5 rounded-2xl bg-white/5 hover:bg-red-500/20 border border-white/10 text-gray-300 text-xs font-black kurdish-text flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              <X className="w-4 h-4" />
              ڕەتکردنەوەی بانگهێشت
            </button>
          </div>
        </div>
      </div>
    );
  };

  const selectSavedFriend = (connection: FriendConnection) => {
    const peer = peerOf(connection);
    setFound({ uid: peer.uid, name: peer.name, uniqueCode: peer.code, avatarUrl: peer.avatar || undefined });
    setFoundConn(connection);
    setInput(peer.code || peer.name);
    setSearchError(null);
    setSearchStatus("found");
    setFriendsOpen(false);
  };

  const renderFriendsDirectory = () => {
    if (!friendsOpen) return null;
    return (
      <div className="mb-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-3" dir="rtl">
        <div className="flex items-center justify-between gap-3 pb-2 border-b border-white/10">
          <div>
            <p className="text-sm font-black text-white kurdish-text">هاوڕێکانم</p>
            <p className="text-[10px] text-gray-400 kurdish-text">هەڵبژێرە بۆ کردنەوەی ڕاستەوخۆی چات</p>
          </div>
          <button type="button" onClick={() => void setFriendPresenceVisibility(!presenceVisible)} disabled={presenceBusy}
            className={`px-3 py-2 rounded-xl border text-[10px] font-black kurdish-text transition-all disabled:opacity-50 ${presenceVisible ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300" : "border-gray-500/30 bg-white/5 text-gray-400"}`}>
            {presenceVisible ? "لەسەر هێڵم" : "دەرەهێڵم"}
          </button>
        </div>
        <div className="mt-2 max-h-52 overflow-y-auto custom-scrollbar space-y-2">
          {acceptedFriends.length === 0 ? (
            <p className="py-5 text-center text-[11px] text-gray-500 kurdish-text">هێشتا هیچ هاوڕێیەکت نییە.</p>
          ) : acceptedFriends.map((connection) => {
            const peer = peerOf(connection);
            const online = !!friendPresence[peer.uid];
            return (
              <div key={connection.id} className="flex items-center gap-2 rounded-xl bg-black/25 border border-white/5 p-2">
                <button type="button" onClick={() => selectSavedFriend(connection)} className="flex min-w-0 flex-1 items-center gap-2 text-right">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${online ? "bg-emerald-400" : "bg-gray-600"}`} />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-black text-white kurdish-text">{peer.name}</span>
                    <span className={`block text-[9px] ${online ? "text-emerald-300" : "text-gray-500"}`}>{online ? "لەسەر هێڵ" : "دەرەهێڵ"}</span>
                  </span>
                </button>
                <button type="button" title="سڕینەوەی هاوڕێ" onClick={async () => {
                  if (nextBusy) return;
                  setNextBusy(true);
                  try { await cancelFriendConnection(connection.id); } finally { setNextBusy(false); }
                }} className="w-8 h-8 rounded-lg text-red-300 hover:bg-red-500/15 flex items-center justify-center">
                  <Trash2 className="w-3.5 h-3.5" />
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
      {renderIncomingCallCard()}
      {renderIncomingSection()}
      {renderOutgoingSection()}
      {renderFriendsDirectory()}

      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base font-black text-white kurdish-text">هاوڕێیەک بدۆزەوە</h3>
          <p className="text-[11px] text-gray-500 kurdish-text mt-1">
            بە ژمارەی مۆبایل یان کۆدی CC-ID، هەژماری هاوڕێکەت بدۆزەرەوە.
          </p>
        </div>
        <button type="button" onClick={() => setFriendsOpen((current) => !current)} className="px-3 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-[10px] font-black kurdish-text flex items-center gap-1.5">
          <Users className="w-4 h-4" />
          هاوڕێکانم ({acceptedFriends.length})
        </button>
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
            {isAnswerableWatchCallStatus(activeCall?.status) ? (
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
                  : expiredCallId === activeCall.id
                    ? "بانگهێشتەکە وەڵام نەدرایەوە (بەسەرچوو) — دووبارە هەوڵ بدەوە"
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
        {renderIncomingCallCard()}
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
    seek?: boolean;
  }) => {
    movieSeqRef.current += 1;
    const payload: MovieSyncPayload = {
      movie: patch.movie !== undefined ? patch.movie : roomMovie,
      playing: patch.playing,
      time: patch.time,
      seq: movieSeqRef.current,
      updatedAt: Date.now(),
      ...(patch.seek ? { seek: true } : {}),
    };
    setMovieTime(patch.time);
    if (!clientRef.current?.sendMovie(payload)) {
      pendingMovieSyncRef.current = payload;
    } else {
      pendingMovieSyncRef.current = null;
    }
  };

  const activateSharedMovie = (movie: SyncedMovie) => {
    remotePlaybackRef.current = false;
    setRoomMovie(movie);
    pendingSeekRef.current = 0;
    setMoviePlaying(true);
    emitMovieSync({ movie, playing: true, time: 0 });
  };

  const selectMovie = (m: any) => {
    const url = resolveMovieSourceUrl(m);
    if (!url) return;
    const synced: SyncedMovie = {
      id: String(m.id || url),
      title: m.title || "بێ ناونیشان",
      image: syncableMovieImage(m.image),
      url,
    };
    setMoviePickerOpen(false);
    sendMovieMessage(synced);
  };

  const handleFullscreen = () => {
    const target = movieFrameRef.current;
    if (!target) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void target.requestFullscreen?.();
  };

  const handleTogglePlay = () => {
    if (!roomMovie) return;
    const v = movieVideoRef.current;
    const yt = movieYoutubeRef.current;
    const next = !moviePlaying;
    remotePlaybackRef.current = false;
    yt?.unMute?.();
    if (v) v.muted = false;
    if (getEmbedFrame()) postEmbedPlayback(next ? "play" : "pause", movieTime);
    setMoviePlaying(next);
    const time = yt && typeof yt.getCurrentTime === "function" ? yt.getCurrentTime() : v?.currentTime || 0;
    emitMovieSync({ movie: undefined, playing: next, time });
  };

  const handleSeek = (time: number) => {
    const v = movieVideoRef.current;
    const yt = movieYoutubeRef.current;
    if ((!v && !yt && !getEmbedFrame()) || !roomMovie) return;
    // Player not mounted/decodable yet: hold the target and apply it in the
    // ready handler (onLoadedMetadata / YT onReady). The peer already received
    // the command; the local side must not act on a stale element.
    if (moviePlayerStateRef.current !== "ready") {
      pendingSeekRef.current = Math.max(0, Number(time) || 0);
      setMovieTime(Math.max(0, Number(time) || 0));
      emitMovieSync({ movie: undefined, playing: moviePlaying, time: Math.max(0, Number(time) || 0), seek: true });
      return;
    }
    const ytDuration = yt && typeof yt.getDuration === "function" ? yt.getDuration() : 0;
    const max = ytDuration || (v?.duration && isFinite(v.duration) ? v.duration : 0);
    const next = Math.max(0, max ? Math.min(time, max) : time);
    if (yt && typeof yt.seekTo === "function") {
      yt.seekTo(next, true);
      // YouTube may ignore the first seek while its media pipeline is changing
      // state. A short idempotent retry keeps the local side aligned with the
      // peer that already received the requested target.
      window.setTimeout(() => {
        if (movieYoutubeRef.current === yt) yt.seekTo(next, true);
      }, 350);
    }
    else if (getEmbedFrame()) postEmbedPlayback("seek", next);
    else if (v) v.currentTime = next;
    setMovieTime(next);
    // Explicit user seek: flagged so the peer applies it immediately instead
    // of only converging on a >4s drift.
    emitMovieSync({ movie: undefined, playing: moviePlaying, time: next, seek: true });
  };

  const handleSeekBy = (delta: number) => {
    const v = movieVideoRef.current;
    const yt = movieYoutubeRef.current;
    if ((!v && !yt && !getEmbedFrame()) || !roomMovie) return;
    const current = yt && typeof yt.getCurrentTime === "function" ? yt.getCurrentTime() : v?.currentTime || movieTimeRef.current;
    handleSeek(current + delta);
  };

  // Fetch the shared movie catalog once (shared by the picker AND the prefetch
  // below) so the Step-4 picker is instant the first time either peer taps it.
  const ensureMovieCatalog = useCallback(() => {
    if (movieCatFetchedRef.current || movieCatLoading) return;
    setMovieCatLoading(true);
    fetch("/api/movies", { headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`movie-catalog-${response.status}`);
        const payload = await response.json();
        const raw = Array.isArray(payload) ? payload : Array.isArray(payload?.results) ? payload.results : Array.isArray(payload?.movies) ? payload.movies : [];
        const list = raw.filter((m: any) => !!resolveMovieSourceUrl(m));
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
  // numbers are tracked PER SENDER (each side counts its own emits from 0, so
  // a shared counter wrongly dropped the peer's legitimate updates once the
  // other side had counted higher). Explicit seeks always apply immediately;
  // ambient pulses only snap the playhead when a meaningful gap exists so
  // they never fight a local in-progress seek.
  const lastRemoteSeqBySenderRef = useRef<Map<string, number>>(new Map());
  // Monotonic EMIT timestamp per sender, tracked alongside the seq high-water.
  // A same-movie payload is only dropped when BOTH are stale: after a peer's
  // reconnect its seq restarts at 0 but its fresh emit carries a NEW updatedAt,
  // so re-selecting the SAME movie must apply instead of stalling until the seq
  // crawls past the old high-water. Server heartbeat replays keep the ORIGINAL
  // updatedAt, so they are still dropped as stale.
  const lastRemoteUpdatedAtBySenderRef = useRef<Map<string, number>>(new Map());
  const handleRemoteMovie = (payload: MovieSyncPayload, fromUid?: string) => {
    if (!payload || !payload.movie) return;
    const senderKey = String(fromUid || "peer");
    // Sequence numbers only dedupe AMBIENT pulses for the SAME movie. A payload
    // that names a DIFFERENT movie is authoritative and must always apply —
    // after either side's counter reset (tab refresh/reconnect), the peer may
    // hold a high "last seen" seq while the sender restarts from 0. Dropping it
    // there left the peer on the previous movie / a black frame. Server replays
    // also carry the ORIGINAL emit seq, so they must not be gated this way.
    const sameMovie =
      !!roomMovie && roomMovie.id === payload.movie.id && roomMovie.url === payload.movie.url;
    if (typeof payload.seq === "number") {
      const lastSeen = lastRemoteSeqBySenderRef.current.get(senderKey) ?? -1;
      const lastSeenAt = lastRemoteUpdatedAtBySenderRef.current.get(senderKey) ?? -1;
      const seqFresh = payload.seq > lastSeen;
      const emittedAt = Number(payload.updatedAt) || 0;
      if (sameMovie && !seqFresh && emittedAt <= lastSeenAt) return;
      if (seqFresh) lastRemoteSeqBySenderRef.current.set(senderKey, payload.seq);
      if (emittedAt > lastSeenAt) lastRemoteUpdatedAtBySenderRef.current.set(senderKey, emittedAt);
    }
    const explicitSeek = payload.seek === true;
    const v = movieVideoRef.current;
    const yt = movieYoutubeRef.current;
    const target = Number(payload.time) || 0;
    remotePlaybackRef.current = true;
    if (!sameMovie) {
      pendingSeekRef.current = target;
      setRoomMovie(payload.movie);
      setMoviePlaying(payload.playing);
      if (yt && typeof yt.seekTo === "function") yt.seekTo(Math.max(0, target), true);
      else if (v) v.currentTime = Math.max(0, target);
      return;
    }
    setMoviePlaying(payload.playing);
    const shouldSnap = explicitSeek
      || (v && (!v.duration || !isFinite(v.duration) || Math.abs(v.currentTime - target) > 4));
    if (v && shouldSnap) {
      v.currentTime = Math.max(0, Math.min(target, v.duration || target));
    }
    if (yt && typeof yt.getCurrentTime === "function"
        && (explicitSeek || Math.abs(yt.getCurrentTime() - target) > 4)) {
      yt.seekTo(target, true);
    }
    if (getEmbedFrame()) {
      postEmbedPlayback("seek", target);
      postEmbedPlayback(payload.playing ? "play" : "pause", target);
    }
  };
  // Latest-version handler so the socket onEvent closure never goes stale.
  const handleRemoteMovieRef = useRef<(p: MovieSyncPayload, fromUid?: string) => void>(() => {});
  handleRemoteMovieRef.current = handleRemoteMovie;

  // YouTube URLs need the IFrame API; assigning an embed URL to <video src>
  // creates an element but can never decode or control the movie.
  const roomYoutubeId = roomMovie ? getYTId(roomMovie.url) : null;
  const roomGenericEmbed = !!roomMovie && !roomYoutubeId && /\/embed\//i.test(roomMovie.url);
  const getEmbedFrame = (): HTMLIFrameElement | null =>
    movieEmbedRef.current || document.getElementById("friend-connect-embed-player") as HTMLIFrameElement | null;
  const postEmbedPlayback = (action: "play" | "pause" | "seek", time: number) => {
    const frame = getEmbedFrame();
    const target = frame?.contentWindow;
    if (!target) return;
    const commands = action === "seek"
      ? [
          { method: "setCurrentTime", value: time, currentTime: time },
          { method: "seekTo", value: time, seconds: time },
          { event: "command", func: "seekTo", args: [time, true] },
        ]
      : [
          { method: action },
          { event: "command", func: action === "play" ? "playVideo" : "pauseVideo", args: [] },
        ];
    commands.forEach((command) => target.postMessage(JSON.stringify(command), "*"));
  };
  useEffect(() => {
    if (!roomMovie || !roomYoutubeId) {
      if (movieYoutubeRef.current?.destroy) movieYoutubeRef.current.destroy();
      movieYoutubeRef.current = null;
      return;
    }
    let cancelled = false;
    let readyTimer: number | null = null;
    if (moviePlayerStateRef.current !== "error") setMoviePlayerState("loading");
    void loadYouTubeAPI()
      .then(() => {
        if (cancelled) return;
        readyTimer = window.setTimeout(() => {
          if (movieYoutubeRef.current) {
            setMoviePlaying(false);
            setMoviePlayerState("error");
          }
        }, 20_000);
        try {
          movieYoutubeRef.current = new (window as any).YT.Player("friend-connect-yt-player", {
            videoId: roomYoutubeId,
            // Muted autoplay is allowed for the receiving participant.  They can
            // then unmute from the shared control bar without seeing a black frame.
            playerVars: { autoplay: 1, mute: 1, controls: 0, playsinline: 1, enablejsapi: 1, origin: window.location.origin },
            events: {
              onReady: (event: any) => {
                if (cancelled) return;
                if (readyTimer !== null) { window.clearTimeout(readyTimer); readyTimer = null; }
                const duration = Number(event.target.getDuration?.()) || 0;
                if (duration) setMovieDuration(duration);
                const target = pendingSeekRef.current;
                if (target != null) event.target.seekTo(target, true);
                pendingSeekRef.current = null;
                // Gate lifted: apply the latest synced command (may have arrived
                // while the API was still booting) — never act on stale state.
                setMoviePlayerState("ready");
                drivePlayback();
              },
              onError: () => {
                if (cancelled) return;
                if (readyTimer !== null) { window.clearTimeout(readyTimer); readyTimer = null; }
                setMoviePlaying(false);
                setMoviePlayerState("error");
              },
            },
          });
        } catch {
          if (!cancelled) {
            setMoviePlaying(false);
            setMoviePlayerState("error");
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMoviePlaying(false);
          setMoviePlayerState("error");
        }
      });
    return () => {
      cancelled = true;
      if (readyTimer !== null) window.clearTimeout(readyTimer);
      if (movieYoutubeRef.current?.destroy) movieYoutubeRef.current.destroy();
      movieYoutubeRef.current = null;
    };
  }, [roomYoutubeId]);

  // Every movie source change tears the previous player down (the <video>
  // remounts via its key, the YouTube effect destroys the YT.Player, the embed
  // iframe remounts) and re-arms the readiness gate — a stale player must never
  // claim "ready" for the NEW source.
  useEffect(() => {
    if (!roomMovie) {
      setMoviePlayerState("idle");
      return;
    }
    setMoviePlayerState("loading");
    setMovieDuration(0);
  }, [roomMovie?.id, roomMovie?.url]);

  // Single point that turns the synced playback state into real player
  // commands — used by the effect below AND by every ready handler so a command
  // that arrived before the player was mounted is applied the moment it is
  // (instead of being fired into a black frame).
  const drivePlayback = () => {
    if (moviePlayerStateRef.current !== "ready") return;
    const v = movieVideoRef.current;
    const yt = movieYoutubeRef.current;
    if (!roomMovieRef.current) return;
    if (yt) {
      if (moviePlayingRef.current) {
        if (remotePlaybackRef.current) yt.mute?.();
        yt.playVideo?.();
      }
      else yt.pauseVideo?.();
    } else if (getEmbedFrame()) {
      postEmbedPlayback(moviePlayingRef.current ? "play" : "pause", movieTimeRef.current);
    } else if (v && moviePlayingRef.current) {
      void v.play().catch(() => {
        v.muted = true;
        void v.play().catch(() => setMoviePlaying(false));
      });
    } else {
      v?.pause();
    }
  };

  // Drive the mounted player from the synced playback state. Re-runs when the
  // readiness gate lifts so a queued play/pause applies exactly once the source
  // can actually decode. Autoplay may still be blocked without a user gesture —
  // then the peer keeps playing and the user just taps Play locally.
  useEffect(() => {
    drivePlayback();
  }, [moviePlaying, roomMovie?.url, moviePlayerState]);

  // Generic <iframe> embed readiness: the shielded player owns the iframe, so
  // lift the gate when its element fires `load` (or fail after a bounded wait
  // instead of leaving a permanent black frame).
  useEffect(() => {
    if (!roomMovie || !roomGenericEmbed) return;
    let cancelled = false;
    const readyTimer = window.setTimeout(() => {
      if (!cancelled) {
        setMoviePlaying(false);
        setMoviePlayerState("error");
      }
    }, 20_000);
    const onLoad = () => {
      if (!cancelled) {
        window.clearTimeout(readyTimer);
        setMoviePlayerState("ready");
        drivePlayback();
      }
    };
    const iv = window.setInterval(() => {
      const frame = getEmbedFrame();
      if (!frame) return;
      frame.addEventListener("load", onLoad, { once: true });
      window.clearInterval(iv);
    }, 150);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
      window.clearTimeout(readyTimer);
      const frame = getEmbedFrame();
      if (frame) frame.removeEventListener("load", onLoad);
    };
  }, [roomMovie?.url, roomGenericEmbed]);

  // Mirror the playhead into UI state and, while playing, push a periodic
  // position pulse to the peer so both sides stay converged without spamming
  // the socket on every timeupdate.
  useEffect(() => {
    let tick = 0;
    const iv = window.setInterval(() => {
      const v = movieVideoRef.current;
      const yt = movieYoutubeRef.current;
      const embed = getEmbedFrame();
      if (!v && !yt && !embed) return;
      const current = yt && typeof yt.getCurrentTime === "function"
        ? yt.getCurrentTime()
        : v?.currentTime || (embed && moviePlaying ? movieTimeRef.current + 0.5 : movieTimeRef.current);
      setMovieTime((prev) => (Math.abs(prev - current) > 0.5 ? current : prev));
      tick += 1;
      if (tick % 16 === 0 && roomMovie && moviePlaying) {
        emitMovieSync({ movie: undefined, playing: true, time: current });
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
            <audio ref={voiceAudioRef} autoPlay />
            <button
              type="button"
              onClick={() => void startVoiceCall()}
              disabled={voiceState === "connecting" || voiceState === "connected"}
              title={voiceState === "connected" ? "پەیوەندی دەنگی چالاکە" : "پەیوەندی دەنگی"}
              className={`px-3 py-2 rounded-xl border text-[11px] font-black kurdish-text flex items-center gap-1.5 transition-all ${voiceState === "connected" ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-300" : "bg-white/5 border-white/10 text-gray-200 hover:bg-white/10"}`}
            >
              <PhoneCall className="w-3.5 h-3.5" />
              {voiceState === "connected" ? "دەنگ چالاکە" : voiceState === "connecting" ? "پەیوەندی..." : "پەیوەندی دەنگی"}
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
                <div ref={movieFrameRef} className="relative aspect-video bg-black overflow-hidden">
                  {roomYoutubeId ? (
                    <div id="friend-connect-yt-player" className="w-full h-full" />
                  ) : roomGenericEmbed ? (
                    <ImmersiveShieldedPlayer
                      key={`${roomMovie.id}__${roomMovie.url}`}
                      url={roomMovie.url}
                      iframeId="friend-connect-embed-player"
                      title={roomMovie.title}
                    />
                  ) : <video
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
                      // Gate lifted: apply the awaited play/seek intent now that
                      // the source reports real metadata (never a black frame).
                      setMoviePlayerState("ready");
                      drivePlayback();
                    }}
                    onCanPlay={() => {
                      setMoviePlayerState((prev) => (prev === "loading" ? "ready" : prev));
                      drivePlayback();
                    }}
                    onDurationChange={(e) => {
                      const d = e.currentTarget.duration;
                      if (d && isFinite(d)) setMovieDuration(d);
                    }}
                    onError={() => {
                      setMoviePlaying(false);
                      setMoviePlayerState("error");
                    }}
                  />}
                  {moviePlayerState === "loading" && (
                    <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/70">
                      <Loader2 className="w-6 h-6 animate-spin text-brand-primary" />
                      <span className="text-[11px] font-bold text-white kurdish-text">بار دەکرێت...</span>
                    </div>
                  )}
                  {moviePlayerState === "error" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 bg-black/85 text-center">
                      <AlertCircle className="w-8 h-8 text-amber-400" />
                      <p className="text-[11px] font-bold text-white kurdish-text">سەرچاوەی فیلمەکە نەکرایەوە</p>
                      <p className="text-[10px] text-gray-400 kurdish-text break-all">{roomMovie.title}</p>
                    </div>
                  )}
                  {!moviePlaying && moviePlayerState !== "error" && (
                    <button
                      type="button"
                      onClick={handleTogglePlay}
                      title="کردنەوە"
                      className="absolute inset-0 m-auto w-14 h-14 rounded-full bg-brand-primary hover:bg-red-700 text-white flex items-center justify-center transition-all"
                    >
                      <Play className="w-6 h-6 ml-0.5" />
                    </button>
                  )}
                  <div className="absolute top-0 inset-x-0 p-2.5 flex items-center justify-between gap-3 pointer-events-none bg-gradient-to-b from-black/85 to-transparent">
                    <div className="min-w-0">
                      <p className="text-[8px] font-black tracking-[0.22em] text-brand-primary uppercase">CinemaChat Pro Player</p>
                      <p className="text-[11px] font-bold text-white truncate kurdish-text">{roomMovie.title}</p>
                    </div>
                    <span className="px-2 py-1 rounded-full bg-black/60 border border-white/10 text-[8px] font-black text-brand-primary">WATCH TOGETHER</span>
                  </div>
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
                    <button
                      type="button"
                      onClick={handleFullscreen}
                      title="پڕکردنەوەی شاشە"
                      className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 flex items-center justify-center transition-all"
                    >
                      <Maximize2 className="w-4 h-4" />
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
          {messages.map((msg) => {
            const sharedMovie = movieFromMessage(msg.text);
            return (
              <div key={msg.clientId} className={`flex ${msg.mine ? "justify-start flex-row-reverse" : "justify-start"}`}>
                {sharedMovie ? (
                  <div className={`max-w-[82%] rounded-2xl border overflow-hidden ${msg.mine ? "border-red-500/30 bg-red-500/10" : "border-white/10 bg-white/5"}`}>
                    {sharedMovie.image && <img src={sharedMovie.image} alt={sharedMovie.title} className="w-full h-24 object-cover" />}
                    <div className="p-3 flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black text-white truncate kurdish-text">{sharedMovie.title}</p>
                        <p className="text-[9px] text-gray-400 mt-1 kurdish-text">فیلمێکی هاوبەش</p>
                      </div>
                      <button type="button" onClick={() => activateSharedMovie(sharedMovie)} className="w-10 h-10 rounded-xl bg-brand-primary hover:bg-red-700 text-white flex items-center justify-center" title="کردنەوەی فیلم">
                        <Play className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed break-words ${msg.mine ? "bg-brand-primary/90 text-white rounded-tr-sm" : "bg-white/10 text-gray-100 rounded-tl-sm"}`}>
                    {msg.text}
                  </div>
                )}
              </div>
            );
          })}
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
          <button
            type="button"
            onClick={openMoviePicker}
            disabled={sessionEnded || chatConnecting || !peerOnline}
            title="ناردنی فیلم"
            className="w-11 h-11 rounded-2xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/30 text-amber-300 flex items-center justify-center transition-all disabled:opacity-50 flex-shrink-0"
          >
            <Film className="w-4 h-4" />
          </button>
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
            disabled={!newMessage.trim() || sessionEnded || chatConnecting || !peerOnline}
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

  if (!open) return null;

  // Live step for the footer indicator + Back visibility (computed once so the
  // nav buttons and the step chips always agree).
  const stepNum = inChat && roomMovie ? 4 : inChat ? 3 : activeConn ? 2 : 1;

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

        {/* Step indicator — 1 FRIEND → 2 CONNECT → 3 CHAT → 4 MOVIE, with a
            visible Back action whenever the user is past Step 1 */}
        <div className="px-5 py-3 bg-black/30 border-t border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2">
            {stepNum >= 2 && (
              <button
                type="button"
                onClick={openMoviePicker}
                disabled={!inChat || stepNum >= 4}
                title="گەڕانەوە بۆ هەنگاوی پێشوو"
                className="px-3 h-9 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-[10px] font-black kurdish-text flex items-center gap-1.5 transition-all flex-shrink-0"
              >
                <ChevronsLeft className="w-4 h-4" />
                <span className="hidden sm:inline">پێشەوە</span>
              </button>
            )}
            <div className="grid grid-cols-4 gap-2 flex-1">
            {[
              { n: 1, label: "Friend" },
              { n: 2, label: "Connect" },
              { n: 3, label: "Chat" },
              { n: 4, label: "Movie" },
            ].map((step) => {
              const active = step.n === stepNum;
              const done = step.n < stepNum;
              return (
                <button
                  type="button"
                  key={step.n}
                  onClick={step.n === 1 && stepNum > 1 ? returnToFriendSearch : undefined}
                  disabled={step.n !== 1 || stepNum === 1}
                  aria-label={step.n === 1 && stepNum > 1 ? "گەڕانەوە بۆ گەڕانی هاوڕێ" : undefined}
                  className={`h-9 rounded-xl border flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                    active
                      ? "bg-brand-primary text-white border-brand-primary"
                      : done
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
                        : "bg-white/5 text-gray-500 border-white/10"
                  } ${step.n === 1 && stepNum > 1 ? "cursor-pointer hover:border-white/50 hover:brightness-125" : "cursor-default"}`}
                >
                  <span className="w-5 h-5 rounded-full bg-black/25 flex items-center justify-center">
                    {done ? <CheckCircle2 className="w-3 h-3" /> : step.n}
                  </span>
                  <span className="hidden sm:inline">{step.label}</span>
                </button>
              );
            })}
            </div>
            <button
              type="button"
              onClick={handleStepBack}
              disabled={stepNum <= 1}
              title="هەنگاوی دواتر"
              className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 flex items-center justify-center transition-all disabled:opacity-30 flex-shrink-0"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default FriendConnectRoom;
