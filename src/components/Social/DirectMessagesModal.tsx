import React, { useState, useEffect, useRef } from "react";
import { MessageSquare, Send, X, Plus, User, Lock, Loader2, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface DirectMessagesModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserProfile: any; // from socialProfile
}

export const DirectMessagesModal: React.FC<DirectMessagesModalProps> = ({
  isOpen,
  onClose,
  currentUserProfile,
}) => {
  const [uniqueCode, setUniqueCode] = useState("");
  const [userName, setUserName] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  // Chat list and active conversation
  const [messages, setMessages] = useState<any[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedPartnerCode, setSelectedPartnerCode] = useState<string | null>(null);
  const [selectedPartnerName, setSelectedPartnerName] = useState<string | null>(null);
  
  // Form states
  const [newMessageText, setNewMessageText] = useState("");
  const [startNewChatPartner, setStartNewChatPartner] = useState("");
  const [isStartingNewChat, setIsStartingNewChat] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [successText, setSuccessText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-authenticate if the user is already logged in with a social profile
  useEffect(() => {
    if (isOpen) {
      if (currentUserProfile?.uniqueCode) {
        setUniqueCode(currentUserProfile.uniqueCode);
        setUserName(currentUserProfile.username || currentUserProfile.name || "هاوڕێیەک");
        setIsAuthenticated(true);
        setErrorText("");
      } else {
        // Reset states if modal is opened fresh and no profile exists
        setIsAuthenticated(false);
        setUniqueCode("");
        setUserName("");
      }
    }
  }, [isOpen, currentUserProfile]);

  // Read all DMs for authenticated unique code
  useEffect(() => {
    if (!isAuthenticated || !uniqueCode) return;

    const fetchDMs = async () => {
      try {
        const res = await fetch(`/api/dms/${encodeURIComponent(uniqueCode)}`);
        if (res.ok) {
          const data = await res.json();
          setMessages(data);
        }
      } catch (err) {
        console.error("Failed to fetch DMs:", err);
      }
    };

    fetchDMs();
    // Poll every 3 seconds to keep it real-time
    const interval = setInterval(fetchDMs, 3000);
    return () => clearInterval(interval);
  }, [isAuthenticated, uniqueCode]);

  // Group messages to active conversations
  useEffect(() => {
    const cleanUser = uniqueCode.trim().toUpperCase();
    const partnerMap = new Map<string, { partnerCode: string; partnerName: string; lastMessage: any; unread?: boolean }>();

    // Sort by timestamp so last message can be correctly chosen
    const sorted = [...messages].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    sorted.forEach((dm) => {
      const isSender = (dm.senderCode || '').toUpperCase() === cleanUser;
      const partnerCode = isSender ? dm.receiverCode : dm.senderCode;
      const partnerName = isSender ? dm.receiverName : dm.senderName;

      partnerMap.set(partnerCode.toUpperCase(), {
        partnerCode: partnerCode.toUpperCase(),
        partnerName: partnerName,
        lastMessage: dm,
      });
    });

    setConversations(Array.from(partnerMap.values()));
  }, [messages, uniqueCode]);

  // Ensure message panel scrolls to bottom when partner or messaging updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, selectedPartnerCode]);

  const handleManualLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText("");
    if (!uniqueCode.trim()) {
      setErrorText("تکایە کۆدی بێهاوتا بنووسە!");
      return;
    }
    
    // Check if the code represents an existing user in the system to set their display name
    setIsLoading(true);
    fetch("/api/admin/users")
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error("Unable to fetch users");
      })
      .then((users) => {
        const uppercaseCode = uniqueCode.trim().toUpperCase();
        const foundUser = users.find((u: any) => (u.uniqueCode || '').toUpperCase() === uppercaseCode);
        if (foundUser) {
          setUserName(foundUser.username || foundUser.name || "هاوڕێیەکی نزیک");
          setIsAuthenticated(true);
        } else {
          // Allow in anyways as guest or show message
          setErrorText("ئەم کۆدی بێهاوتایە لە لیستدا نەدۆزرایەوە، تکایە دڵنیابەرەوە لە ڕاستی لۆگینەکە!");
        }
      })
      .catch((_) => {
        // Fallback
        setUserName(`بەکارهێنەر - ${uniqueCode.substring(0, 4)}`);
        setIsAuthenticated(true);
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessageText.trim() || !selectedPartnerCode || !uniqueCode) return;

    setIsSending(true);
    setErrorText("");
    try {
      const res = await fetch("/api/dms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderCode: uniqueCode,
          senderName: userName,
          targetCodeOrName: selectedPartnerCode,
          message: newMessageText.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setNewMessageText("");
        // Instantly append locally
        setMessages((prev) => [...prev, data.message]);
      } else {
        setErrorText(data.error || "نەتوانرا نامەکە بنێردرێت");
      }
    } catch (err) {
      setErrorText("هەڵە لە پەیوەندی سێرڤەر");
    } finally {
      setIsSending(false);
    }
  };

  const handleStartNewChat = async (e: React.FormEvent) => {
    e.preventDefault();
    const partner = startNewChatPartner.trim();
    if (!partner || !uniqueCode) return;

    setIsLoading(true);
    setErrorText("");
    setSuccessText("");

    try {
      // Look up target to verify they exist
      const res = await fetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromUserCode: uniqueCode,
          fromUserName: userName,
          targetCodeOrName: partner,
          roomId: "DM_VERIFY_ROOM_DUMMY",
          roomName: "DM_VERIFY",
        }),
      });

      const data = await res.json();
      // If we got clean respond or code-based error:
      if (res.status === 400 && data.error?.includes("خۆت")) {
        setErrorText("ناتوانیت چاتی دایرێکت لەگەڵ خۆتدا بکەیت!");
        setIsLoading(false);
        return;
      }

      if (res.ok || (res.status === 400 && data.error?.includes("خۆت"))) {
        // It exists! Find uniqueCode of target from notifications endpoint or user DB directly.
        const usersRes = await fetch("/api/admin/users");
        if (usersRes.ok) {
          const usersList = await usersRes.json();
          const cleanPartner = partner.toUpperCase();
          const found = usersList.find((u: any) => 
            (u.uniqueCode || '').toUpperCase() === cleanPartner || 
            (u.username || u.name || '').toUpperCase() === cleanPartner
          );

          if (found) {
            setSelectedPartnerCode((found.uniqueCode || '').toUpperCase());
            setSelectedPartnerName(found.username || found.name || "هاوڕێ");
            setIsStartingNewChat(false);
            setStartNewChatPartner("");
            setSuccessText("چاتی نوێ چالاککرا!");
            setTimeout(() => setSuccessText(""), 3000);
          } else {
            setErrorText("بەکارھێنەرەکە نەدۆزرایەوە!");
          }
        }
      } else {
        setErrorText(data.error || "ئەم بەکارهێنەرە یان کۆدە بوونی نییە لە لیستدا");
      }
    } catch (err) {
      setErrorText("شکست لە پەیوەندی لەگەڵ سێرڤەر");
    } finally {
      setIsLoading(false);
    }
  };

  // Filter messages for active conversation
  const activeChatMessages = messages.filter((dm) => {
    if (!selectedPartnerCode) return false;
    const cleanPartner = selectedPartnerCode.toUpperCase();
    const sCode = (dm.senderCode || '').toUpperCase();
    const rCode = (dm.receiverCode || '').toUpperCase();
    return (sCode === cleanPartner || rCode === cleanPartner);
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 backdrop-blur-md bg-black/60">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="relative w-full max-w-2xl h-[520px] bg-zinc-950/95 border border-white/10 rounded-2xl shadow-[0_12px_45px_rgba(0,0,0,0.7)] overflow-hidden flex flex-col"
      >
        {/* Glow Header Accents */}
        <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-teal-500 via-brand-primary to-indigo-500" />

        {/* Modal Top Nav */}
        <div className="flex items-center justify-between p-3.5 border-b border-white/5 bg-zinc-900/45 shrink-0">
          <div className="flex items-center gap-2 text-right">
            <MessageSquare className="w-4 h-4 text-teal-400" />
            <div>
              <h3 className="text-xs font-black text-white kurdish-text">نامە هەمیشەیی و دایرێکتەکان</h3>
              <p className="text-[8.5px] text-gray-400 font-bold kurdish-text">تایبەت بە چات و نامەی بێهاوتا لە ڕێی کۆدەوە</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-white rounded-lg hover:bg-white/5 transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Outer Content Block */}
        <div className="flex-1 flex overflow-hidden min-h-0 bg-zinc-950">
          {!isAuthenticated ? (
            /* Secure Access Gate by Unique Code */
            <div className="flex-1 flex flex-col items-center justify-center p-5 text-center max-w-sm mx-auto">
              <div className="w-11 h-11 rounded-xl bg-zinc-900 border border-white/10 flex items-center justify-center mb-3">
                <Lock className="w-5 h-5 text-yellow-500" />
              </div>
              <h4 className="text-white text-xs font-black kurdish-text">سەیری دایرێکتەکانی خۆت بکە</h4>
              <p className="text-gray-400 text-[9.5px] my-2 leading-relaxed kurdish-text">
                تکایە کۆدی بێهاوتای خۆت بنووسە بۆ خوێندنەوە و چوونە ناو سندوقی نامەکانت. هەموو داتاکانت بە پارێزراوی لای خۆت دەمێننەوە.
              </p>

              <form onSubmit={handleManualLogin} className="w-full space-y-2.5">
                <div className="relative">
                  <input
                    type="text"
                    value={uniqueCode}
                    onChange={(e) => setUniqueCode(e.target.value)}
                    placeholder="کۆدی بێهاوتا (وەک: uniqueID_12)"
                    className="w-full px-3 py-2.5 bg-black border border-white/10 rounded-xl text-center text-[11px] text-white uppercase focus:outline-none focus:border-yellow-500 font-mono tracking-wider"
                  />
                </div>
                {errorText && (
                  <p className="text-[9px] text-red-400 font-bold kurdish-text">{errorText}</p>
                )}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 bg-gradient-to-r from-teal-500 to-indigo-600 hover:from-teal-600 hover:to-indigo-700 disabled:from-zinc-900 text-white rounded-xl text-[10.5px] font-black kurdish-text flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-[0.98]"
                >
                  {isLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                  ) : (
                    "چوونە ناو سندوقی نامەکان ✓"
                  )}
                </button>
              </form>
            </div>
          ) : (
            /* Authenticated Inbox Shell */
            <div className="flex-1 flex min-h-0 divide-x divide-white/5 rtl:divide-x-reverse">
              {/* Conversations sidebar */}
              <div className="w-56 border-r border-white/5 bg-zinc-900/20 flex flex-col shrink-0">
                <div className="p-2.5 border-b border-white/5 flex items-center justify-between">
                  <span className="text-[9px] text-gray-400 font-black kurdish-text">چاتەکان ({conversations.length})</span>
                  <button
                    onClick={() => setIsStartingNewChat(true)}
                    className="flex items-center gap-1 p-0.5 px-2 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/20 text-teal-400 rounded-lg text-[8.5px] font-black kurdish-text cursor-pointer transition-all active:scale-95"
                  >
                    <Plus className="w-2.5 h-2.5" /> چاتی نوێ
                  </button>
                </div>

                {/* Profile Identity display */}
                <div className="p-2.5 bg-black/40 border-b border-white/5 flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="w-6 h-6 rounded-lg bg-teal-500/20 flex items-center justify-center border border-teal-500/30 shrink-0">
                      <User className="w-3 h-3 text-teal-400" />
                    </div>
                    <div className="text-right min-w-0">
                      <p className="text-[9px] font-black text-gray-200 truncate">{userName}</p>
                      <p className="text-[7.5px] font-mono text-gray-500 tracking-wider truncate uppercase">{uniqueCode}</p>
                    </div>
                  </div>
                  {/* Option to clear context / sign-out of inbox view logic */}
                  <button
                    onClick={() => {
                      setIsAuthenticated(false);
                      setUniqueCode("");
                      setSelectedPartnerCode(null);
                    }}
                    className="text-[7.5px] px-1.5 py-0.5 text-gray-500 hover:text-red-400 font-black border border-white/5 hover:border-red-500/20 rounded kurdish-text transition-all cursor-pointer"
                  >
                    دەرچوون
                  </button>
                </div>

                {/* Conversation partners list */}
                <div className="flex-1 overflow-y-auto p-1 space-y-1">
                  <AnimatePresence>
                    {conversations.length === 0 ? (
                      <div className="p-6 text-center text-gray-500">
                        <MessageSquare className="w-6 h-6 mx-auto mb-1.5 opacity-20" />
                        <p className="text-[9px] kurdish-text">هیچ گفتوگۆیەک نییە</p>
                      </div>
                    ) : (
                      conversations.map((convo) => {
                        const isSelected = selectedPartnerCode?.toUpperCase() === convo.partnerCode.toUpperCase();
                        const isSenderMe = (convo.lastMessage.senderCode || '').toUpperCase() === uniqueCode.trim().toUpperCase();
                        
                        return (
                          <button
                            key={convo.partnerCode}
                            onClick={() => {
                              setSelectedPartnerCode(convo.partnerCode);
                              setSelectedPartnerName(convo.partnerName);
                            }}
                            className={`w-full text-right p-2 rounded-xl flex flex-col gap-0.5 transition-all ${
                              isSelected
                                ? "bg-teal-500/10 border border-teal-500/20 text-white"
                                : "hover:bg-white/5 border border-transparent text-gray-400"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-[9px] font-black text-gray-100 truncate">
                                @{convo.partnerName}
                              </span>
                              <span className="text-[6.5px] font-mono text-gray-500">
                                {new Date(convo.lastMessage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 min-w-0">
                              {isSenderMe && <span className="text-[7.5px] text-gray-500 font-black shrink-0 font-sans">تۆ:</span>}
                              <p className="text-[8.5px] text-gray-400 truncate w-full kurdish-text leading-tight">
                                {convo.lastMessage.message}
                              </p>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Chat pane */}
              <div className="flex-1 flex flex-col min-h-0 bg-black/10">
                {isStartingNewChat ? (
                  /* Create New Conversation Box */
                  <div className="flex-1 flex flex-col items-center justify-center p-5 text-center">
                    <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mb-2.5">
                      <Plus className="w-4 h-4 text-teal-400" />
                    </div>
                    <h5 className="text-xs font-black text-white kurdish-text">دەستپێکردنی گفتوگۆی نوێ</h5>
                    <p className="text-[9px] text-gray-400 max-w-[200px] mt-1 mb-3 kurdish-text leading-relaxed">
                      کۆدی بێهاوتا (ID) یان ناوی یەکێک لە هاوڕێکانت بنووسە بۆ دروستکردنی هێڵی گفتوگۆ
                    </p>

                    <form onSubmit={handleStartNewChat} className="w-full max-w-[240px] space-y-2.5">
                      <input
                        type="text"
                        value={startNewChatPartner}
                        onChange={(e) => setStartNewChatPartner(e.target.value)}
                        placeholder="کۆدی ناسنامە (ID) یان ناوی هاوڕێ..."
                        className="w-full px-3 py-2 bg-zinc-900 border border-white/10 rounded-xl text-center text-[10px] text-white focus:outline-none focus:border-teal-500 font-sans"
                        autoFocus
                      />
                      {errorText && (
                        <p className="text-[8px] text-red-500 font-bold kurdish-text leading-snug">{errorText}</p>
                      )}
                      <div className="flex gap-1.5 justify-center">
                        <button
                          type="button"
                          onClick={() => {
                            setIsStartingNewChat(false);
                            setStartNewChatPartner("");
                            setErrorText("");
                          }}
                          className="px-3 py-1.5 text-[9px] bg-zinc-900 text-gray-400 hover:text-white rounded-xl font-black kurdish-text transition-all cursor-pointer"
                        >
                          پەشیمانبوونەوە
                        </button>
                        <button
                          type="submit"
                          disabled={isLoading || !startNewChatPartner.trim()}
                          className="px-4 py-1.5 text-[9px] bg-teal-600 hover:bg-teal-700 disabled:bg-zinc-800 text-white rounded-xl font-black kurdish-text transition-all cursor-pointer"
                        >
                          بگەڕێ و دەستپێبکە
                        </button>
                      </div>
                    </form>
                  </div>
                ) : selectedPartnerCode ? (
                  /* Active conversational thread */
                  <>
                    <div className="p-2.5 border-b border-white/5 bg-zinc-900/10 flex items-center justify-between px-3 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
                        <span className="text-[11px] font-black text-white">@{selectedPartnerName}</span>
                        <span className="text-[7.5px] font-mono text-gray-500 bg-white/5 px-1.5 py-0.5 rounded tracking-wider uppercase">
                          {selectedPartnerCode}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedPartnerCode(null);
                        }}
                        className="p-1 text-gray-500 hover:text-white rounded-lg hover:bg-white/5 transition-all text-[8px] font-black kurdish-text border border-white/5 cursor-pointer flex items-center gap-1"
                      >
                        <ArrowRight className="w-3 h-3" /> جێهێشتن
                      </button>
                    </div>

                    {/* Messages content area */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                      {activeChatMessages.map((dm) => {
                        const isMe = (dm.senderCode || '').toUpperCase() === uniqueCode.trim().toUpperCase();
                        return (
                          <div
                            key={dm.id}
                            className={`flex ${isMe ? "justify-start" : "justify-end"}`}
                          >
                            <div
                              className={`max-w-[75%] p-2.5 rounded-2xl flex flex-col gap-0.5 text-right ${
                                isMe
                                  ? "bg-gradient-to-r from-teal-500 to-indigo-600 text-white rounded-tl-none shadow-[0_2px_8px_rgba(20,184,166,0.1)]"
                                  : "bg-zinc-900 border border-white/5 text-gray-100 rounded-tr-none"
                              }`}
                            >
                              <span className="text-[8px] font-black opacity-60">
                                {isMe ? `@${dm.senderName}` : `@${dm.senderName}`}
                              </span>
                              <p className="text-[10px] kurdish-text font-medium leading-relaxed break-words whitespace-pre-wrap">
                                {dm.message}
                              </p>
                              <span className="text-[7px] opacity-40 font-mono tracking-wider font-bold mt-0.5 self-start">
                                {new Date(dm.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>

                    {/* Chat input form */}
                    <div className="p-2 border-t border-white/5 bg-zinc-950/50 shrink-0">
                      <form onSubmit={handleSendMessage} className="flex gap-1.5">
                        <input
                          type="text"
                          value={newMessageText}
                          onChange={(e) => setNewMessageText(e.target.value)}
                          placeholder="نامەیەکی دایرێکت بنووسە..."
                          className="flex-1 px-3 py-2 bg-black border border-white/5 rounded-xl text-[10px] text-white focus:outline-none focus:border-teal-500/50 kurdish-text font-bold"
                          disabled={isSending}
                        />
                        <button
                          type="submit"
                          disabled={isSending || !newMessageText.trim()}
                          className="px-3 py-2 bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 disabled:bg-zinc-800 disabled:text-gray-500 rounded-xl text-white font-black cursor-pointer flex items-center justify-center transition-all active:scale-95 text-[9px]"
                        >
                          <Send className="w-3 h-3" />
                        </button>
                      </form>
                      {errorText && (
                        <p className="text-[8.5px] text-red-400 font-bold kurdish-text mt-1 text-right">{errorText}</p>
                      )}
                    </div>
                  </>
                ) : (
                  /* No dialogue selected dashboard */
                  <div className="flex-1 flex flex-col items-center justify-center p-5 text-center text-gray-500">
                    <MessageSquare className="w-8 h-8 text-gray-600 animate-bounce mb-2" />
                    <h5 className="text-[11px] font-black text-gray-400 kurdish-text">گفتوگۆیەک هەڵبژێرە</h5>
                    <p className="text-[9px] text-gray-500 mt-1 max-w-[180px] kurdish-text leading-relaxed">
                      کاربەری دڵخوازی خۆت هەڵبژێرە یان چاتی نوێ دروستکە بۆ دەستپێکردنی گفتوگۆ!
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
