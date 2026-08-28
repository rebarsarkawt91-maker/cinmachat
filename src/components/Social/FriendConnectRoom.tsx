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
} from "lucide-react";
import {
  createFriendConnection,
  respondToFriendConnection,
  cancelFriendConnection,
  getFriendConnectionBetween,
  searchAccountByCCIdOrContact,
  subscribeConnectionsForUser,
  maskInvitePhone,
} from "../../services/friendConnect";
import type {
  ContactSearchResult,
  FriendConnection,
} from "../../services/friendConnect";
import { censorOutgoingMessage } from "../../services/bannedWords";
import { PrivateChatClient, fetchPrivateSessionId } from "../../services/privateChatClient";
import type { PrivateChatMessage } from "../../services/privateChatClient";
import type { AccountReadiness } from "../../services/accountReadiness";

// ---------------------------------------------------------------------------
// Friend → Connect private 1-to-1 flow (replaces the old general chat flow).
//
//   FRIEND 1   search by phone number or CC-ID → found card → پێشەوە (NEXT)
//   CONNECT 2  invitation sent → waiting for acceptance → auto-open on accept
//   CHAT       3  private ephemeral chat (server in-memory session only)
//   MOVIE      4  movie / watch-party selection within the active chat
//
// NO general/global chat lives here: every message is scoped to the accepted
// connection's private session, and messages are held ONLY in React state —
// cleared on leave/close/re-open, never persisted anywhere.
//
// ACCOUNT GATE: nothing below FRIEND 1 runs until the account readiness state
// machine reports "ready". Guests see the login/create prompt, incomplete
// accounts see the Complete-Account prompt, and no Firestore listener or
// WebSocket is ever opened before READY.
// ---------------------------------------------------------------------------

interface FriendConnectRoomProps {
  open: boolean;
  onClose: () => void;
  myUid: string;
  myName: string;
  myCode: string;
  myAvatar?: string;
  /** Shared account-readiness result (checking|guest|authenticated-incomplete|ready|error). */
  readiness: AccountReadiness;
  onRequestAccount?: () => void;
  onRetryAuth?: () => void;
  onCompleteAccount?: () => void;
}

interface DisplayMessage extends PrivateChatMessage {
  mine: boolean;
  confirmed: boolean;
}

type SearchStatus = "idle" | "searching" | "found" | "error";

const generateClientId = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `m_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const missingFieldLabel = (field: string): string => {
  switch (field) {
    case "displayName":
      return "ناو";
    case "username":
      return "ناوی بەکارهێنەر";
    case "memberCode":
      return "CC-ID";
    case "identity":
      return "ئیمەیڵ یان ژمارەی مۆبایل";
    default:
      return field;
  }
};

export const FriendConnectRoom: React.FC<FriendConnectRoomProps> = ({
  open,
  onClose,
  myUid,
  myName,
  myCode,
  myAvatar,
  readiness,
  onRequestAccount,
  onRetryAuth,
  onCompleteAccount,
}) => {
  const [tab, setTab] = useState<"phone">("phone");
  const [input, setInput] = useState("");
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [found, setFound] = useState<ContactSearchResult | null>(null);
  const [foundConn, setFoundConn] = useState<FriendConnection | null>(null);
  const [nextBusy, setNextBusy] = useState(false);

  // Auth-gate cap: "checking" may only spin for a short window. After 3s the
  // room surfaces Retry/Close so the user is never stuck on an indefinite
  // spinner when auth/profile resolution hangs.
  const [gateTimedOut, setGateTimedOut] = useState(false);
  useEffect(() => {
    if (!open || readiness.state !== "checking") {
      setGateTimedOut(false);
      return;
    }
    const timer = window.setTimeout(() => setGateTimedOut(true), 3000);
    return () => window.clearTimeout(timer);
  }, [open, readiness.state]);

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
  // Firestore listeners NEVER start until the readiness gate reports "ready".
  // A guest/incomplete/error account must resolve before any connection data is
  // observed — otherwise stale or half-owned state could render a fake flow.
  const accountReady = readiness.state === "ready";
  useEffect(() => {
    if (!open || !accountReady || !myUid) return;
    const unsub = subscribeConnectionsForUser(
      myUid,
      (list) => setConnections(list),
      () => {},
    );
    return unsub;
  }, [open, accountReady, myUid]);

  // Auto-open the most recent accepted connection (e.g. right after the other
  // side accepts while the room is open on the target's device).
  useEffect(() => {
    if (!open || activeId) return;
    const accepted = connections.filter((c) => c.status === "accepted");
    if (accepted.length === 0) return;
    const latest = [...accepted].sort((a, b) =>
      (b.acceptedAt || b.updatedAt || "").localeCompare(a.acceptedAt || a.updatedAt || ""),
    )[0];
    setActiveId(latest.id);
  }, [open, activeId, connections]);

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
  const handleSearch = useCallback(async () => {
    const raw = input.trim();
    if (!raw || searchStatus === "searching") return;
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
      setFound(result);
      setSearchStatus("found");
      // Existing relationship with this peer (label the primary button).
      const existing = await getFriendConnectionBetween(myUid, result.uid);
      setFoundConn(existing);
    } catch {
      setSearchStatus("error");
      setSearchError("دۆزینەوە سەرکەوتوو نەبوو؛ دووبارە هەوڵبدە");
    }
  }, [input, myUid, searchStatus]);

  const chooseAnother = useCallback(() => {
    setFound(null);
    setFoundConn(null);
    setSearchStatus("idle");
    setSearchError(null);
    setInput("");
  }, []);

  const handleNext = useCallback(async () => {
    if (!found || nextBusy) return;
    setNextBusy(true);
    try {
      const { id } = await createFriendConnection({
        requesterUid: myUid,
        requesterName: myName,
        requesterCode: myCode,
        requesterAvatar: myAvatar || null,
        target: found,
      });
      setActiveId(id);
      setSearchStatus("idle");
    } catch {
      setSearchError("ناردنی بانگهێشت سەرکەوتوو نەبوو؛ دووبارە هەوڵ بدە");
    } finally {
      setNextBusy(false);
    }
  }, [found, myUid, myName, myCode, myAvatar, nextBusy]);

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

  const renderAccountGate = () => (
    <div className="flex flex-col items-center justify-center gap-4 py-12 text-center px-6" dir="rtl">
      <div className="w-16 h-16 rounded-full bg-brand-primary/15 border border-brand-primary/30 flex items-center justify-center">
        <MessageCircle className="w-8 h-8 text-brand-primary" />
      </div>
      <div>
        <p className="text-sm font-black text-white kurdish-text">گفتوگۆی تایبەت</p>
        <p className="mt-2 text-[12px] text-gray-400 kurdish-text leading-relaxed">
          بۆ ناردنی بانگهێشت و گفتوگۆی تایبەتی 1-بۆ-1 پێویستت بە ئەکاونتێکە.
        </p>
      </div>
      <button
        type="button"
        onClick={onRequestAccount}
        className="px-5 py-3 rounded-2xl bg-brand-primary hover:bg-red-700 text-white text-xs font-black kurdish-text transition-all shadow-lg shadow-red-600/20"
      >
        ئەکاونت دروست بکە یان بچۆ ژوورەوە
      </button>
    </div>
  );

  const renderCheckingGate = () => (
    <div className="flex flex-col items-center justify-center gap-4 py-12 text-center px-6">
      <Loader2 className="w-6 h-6 animate-spin text-brand-primary" />
      <p className="text-[12px] text-gray-400 kurdish-text">
        بەردەستی ئەکاونت دەپشکنرێت...
      </p>
    </div>
  );

  const renderGateTimeout = () => (
    <div className="flex flex-col items-center justify-center gap-4 py-12 text-center px-6" dir="rtl">
      <AlertCircle className="w-8 h-8 text-amber-400" />
      <p className="text-[12px] text-gray-400 kurdish-text leading-relaxed">
        پشکنینی ئەکاونت ماوەی تێپەڕاند. تکایە دووبارە هەوڵبدەرەوە.
      </p>
      <div className="grid grid-cols-2 gap-2 w-full max-w-[240px]">
        <button
          type="button"
          onClick={onRetryAuth}
          className="px-5 py-3 rounded-2xl bg-brand-primary hover:bg-red-700 text-white text-xs font-black kurdish-text transition-all"
        >
          دووبارە هەوڵدانەوە
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-5 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-xs font-black kurdish-text transition-all"
        >
          داخستن
        </button>
      </div>
    </div>
  );

  const renderIncompleteGate = () => (
    <div className="flex flex-col items-center justify-center gap-4 py-12 text-center px-6" dir="rtl">
      <div className="w-16 h-16 rounded-full bg-amber-400/15 border border-amber-400/30 flex items-center justify-center">
        <AlertCircle className="w-8 h-8 text-amber-400" />
      </div>
      <div>
        <p className="text-sm font-black text-white kurdish-text">ئەکاونتەکەت تەواو نییە</p>
        <p className="mt-2 text-[12px] text-gray-400 kurdish-text leading-relaxed">
          بۆ بەکارهێنانی CinemaChat پێویستە ئەم خانانە پڕ بکەیتەوە:
        </p>
        <ul className="mt-2 flex flex-col items-center gap-1 text-[11px] font-bold text-amber-300 kurdish-text">
          {readiness.missingFields.map((field) => (
            <li key={field}>• {missingFieldLabel(field)}</li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        onClick={onCompleteAccount}
        className="px-5 py-3 rounded-2xl bg-brand-primary hover:bg-red-700 text-white text-xs font-black kurdish-text transition-all shadow-lg shadow-red-600/20"
      >
        تەواوکردنی ئەکاونت
      </button>
    </div>
  );

  const renderGateError = () => (
    <div className="flex flex-col items-center justify-center gap-4 py-12 text-center px-6" dir="rtl">
      <AlertCircle className="w-8 h-8 text-amber-400" />
      <p className="text-[12px] text-gray-400 kurdish-text leading-relaxed">
        {readiness.error || "ناتوانین ئەکاونتەکەت بپشکنین. تکایە دووبارە هەوڵبدەرەوە."}
      </p>
      <div className="grid grid-cols-2 gap-2 w-full max-w-[240px]">
        <button
          type="button"
          onClick={onRetryAuth}
          className="px-5 py-3 rounded-2xl bg-brand-primary hover:bg-red-700 text-white text-xs font-black kurdish-text transition-all"
        >
          دووبارە هەوڵدانەوە
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-5 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-xs font-black kurdish-text transition-all"
        >
          داخستن
        </button>
      </div>
    </div>
  );

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
                setInput("");
                setFound(null);
                setFoundConn(null);
                setSearchStatus("idle");
                setSearchError(null);
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
            if (searchStatus === "error" || searchStatus === "found") {
              setSearchStatus("idle");
              setSearchError(null);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSearch();
          }}
          type="tel"
          inputMode="tel"
          placeholder="بۆ نموونە: 0750 123 4567 یان CC-8291"
          className="flex-1 min-w-0 px-4 py-3 rounded-2xl bg-black/40 border border-white/10 focus:border-brand-primary/60 outline-none text-sm text-white placeholder:text-gray-600"
        />
        <button
          type="button"
          onClick={() => void handleSearch()}
          disabled={!input.trim() || searchStatus === "searching"}
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
              {foundConn?.status === "accepted"
                ? "کردنەوەی چات"
                : foundConn?.status === "pending"
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
    switch (readiness.state) {
      case "checking":
        return gateTimedOut ? renderGateTimeout() : renderCheckingGate();
      case "guest":
        return renderAccountGate();
      case "authenticated-incomplete":
        return renderIncompleteGate();
      case "error":
        return renderGateError();
      default:
        break;
    }
    if (!myUid) return renderAccountGate();
    if (inChat) return renderChatStep();
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
              const ready = readiness.state === "ready";
              const stepNum = !ready || !myUid ? 0 : inChat ? 3 : activeConn ? 2 : 1;
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